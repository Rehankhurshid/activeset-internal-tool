import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import {
  buildClickUpTaskUrl,
  ClickUpError,
  clickUpTaskToUpdate,
  fetchClickUpList,
  listTasksInList,
  parseClickUpListId,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
// Bulk import a large list can take a minute. Vercel's default is now 300s, so
// give ourselves headroom but cap explicitly so a runaway import can't sit forever.
export const maxDuration = 180;

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const TASKS_COLLECTION = COLLECTIONS.TASKS;

interface LinkListBody {
  projectId?: string;
  /** ClickUp list URL or numeric id */
  clickupListRef?: string;
}

/** POST — link a ClickUp list to a project, then bulk-import every task in it. */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: LinkListBody | null = null;
  try {
    body = (await request.json()) as LinkListBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  const ref = body?.clickupListRef?.trim();
  if (!projectId || !ref) {
    return NextResponse.json(
      { error: 'projectId and clickupListRef are required' },
      { status: 400 },
    );
  }

  const listId = parseClickUpListId(ref);
  if (!listId) {
    return NextResponse.json(
      { error: 'Could not extract a ClickUp list id from the provided value' },
      { status: 400 },
    );
  }

  try {
    const caller = await requireProjectAccess(request, projectId);

    // Reject if a different project is already bound to this ClickUp list.
    const existing = await adminDb
      .collection(PROJECTS_COLLECTION)
      .where('clickupListId', '==', listId)
      .limit(1)
      .get();
    if (!existing.empty && existing.docs[0].id !== projectId) {
      const otherName = (existing.docs[0].data() as { name?: string }).name;
      return NextResponse.json(
        {
          error: `That ClickUp list is already linked to another project${otherName ? ` ("${otherName}")` : ''}.`,
        },
        { status: 409 },
      );
    }

    // Fetch list metadata + every task in the list.
    const [list, tasks] = await Promise.all([
      fetchClickUpList(listId),
      listTasksInList(listId),
    ]);

    // Persist the binding on the project doc.
    await adminDb.collection(PROJECTS_COLLECTION).doc(projectId).update({
      clickupListId: listId,
      clickupListName: list.name,
      updatedAt: Timestamp.now(),
    });

    // Bulk-create / update local tasks. We use one batch per 400 docs (Firestore
    // batches cap at 500 writes; we leave headroom for the project update above).
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let nextOrder = Date.now();

    // Pre-load any local tasks already linked to ids in this list so we don't
    // double-create on re-link.
    const taskIds = tasks.map((t) => t.id);
    const existingByClickupId = new Map<string, { docId: string; projectId: string }>();
    // `where('clickupTaskId', 'in', [...])` caps at 30 values per query, so chunk.
    for (let i = 0; i < taskIds.length; i += 30) {
      const chunk = taskIds.slice(i, i + 30);
      const snap = await adminDb
        .collection(TASKS_COLLECTION)
        .where('clickupTaskId', 'in', chunk)
        .get();
      snap.docs.forEach((d) => {
        const data = d.data() as { clickupTaskId?: string; projectId?: string };
        if (data.clickupTaskId) {
          existingByClickupId.set(data.clickupTaskId, {
            docId: d.id,
            projectId: data.projectId ?? '',
          });
        }
      });
    }

    let batch = adminDb.batch();
    let writesInBatch = 0;
    const now = Timestamp.now();

    for (const task of tasks) {
      const patch = clickUpTaskToUpdate(task);
      const completedAt = patch.status === 'done' ? now : null;
      const baseFields = {
        ...patch,
        completedAt,
        clickupTaskId: task.id,
        clickupUrl: task.url ?? buildClickUpTaskUrl(task.id),
        clickupSyncedAt: now,
        source: 'clickup' as const,
        updatedAt: now,
      };

      const existing = existingByClickupId.get(task.id);
      if (existing) {
        if (existing.projectId !== projectId) {
          // Already mirrored under a different project — skip rather than steal it.
          skipped += 1;
          continue;
        }
        const ref = adminDb.collection(TASKS_COLLECTION).doc(existing.docId);
        batch.update(ref, baseFields);
        updated += 1;
      } else {
        const ref = adminDb.collection(TASKS_COLLECTION).doc();
        batch.set(ref, {
          ...baseFields,
          projectId,
          tags: patch.tags ?? [],
          category: 'other',
          createdAt: now,
          createdBy: caller.email,
          order: nextOrder++,
        });
        created += 1;
      }

      writesInBatch += 1;
      if (writesInBatch >= 400) {
        await batch.commit();
        batch = adminDb.batch();
        writesInBatch = 0;
      }
    }

    if (writesInBatch > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      listId,
      listName: list.name,
      totalTasks: tasks.length,
      created,
      updated,
      skipped,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof ClickUpError) {
      return NextResponse.json(
        { error: 'ClickUp request failed', details: err.message },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-link-list] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — unbind the project from any ClickUp list. Existing imported tasks
 *  keep their per-task link until ClickUp tells us otherwise (drift cron + webhook). */
export async function DELETE(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId')?.trim();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    await requireProjectAccess(request, projectId);
    await adminDb.collection(PROJECTS_COLLECTION).doc(projectId).update({
      clickupListId: null,
      clickupListName: null,
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
