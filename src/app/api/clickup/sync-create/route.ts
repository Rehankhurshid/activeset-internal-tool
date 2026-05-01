import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import {
  buildClickUpTaskUrl,
  buildEmailToClickUpIdMap,
  ClickUpError,
  type ClickUpMember,
  createClickUpTask,
  fetchClickUpList,
  fetchTeamMembers,
  taskStatusToClickUpStatus,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type { TaskPriority, TaskStatus } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;

/** Read the workspace ("team") id from the same secrets doc the webhook uses. */
async function loadClickUpTeamId(): Promise<string | null> {
  try {
    const snap = await adminDb.collection(APP_SECRETS_COLLECTION).doc('clickup').get();
    if (!snap.exists) return null;
    const data = snap.data() as { teamId?: string } | undefined;
    return data?.teamId ?? null;
  } catch (err) {
    console.warn('[clickup-sync-create] could not read app_secrets/clickup', err);
    return null;
  }
}

interface SyncCreateBody {
  projectId?: string;
  taskIds?: string[];
}

interface SyncResult {
  taskId: string;
  status: 'synced' | 'skipped' | 'failed';
  reason?: string;
  clickupTaskId?: string;
  clickupUrl?: string;
}

/**
 * Push freshly-created local tasks to ClickUp as new tasks in the project's
 * bound list. One-way (app → ClickUp) — the inbound side is handled by the
 * webhook. On per-task failure, the task is marked with `clickupSyncError`
 * and `clickupSyncFailedAt` so the UI can surface a retry affordance.
 *
 * No-ops when the project has no `clickupListId` bound. Already-linked tasks
 * (tasks that already carry a `clickupTaskId`) are skipped to avoid creating
 * duplicates.
 */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: SyncCreateBody | null = null;
  try {
    body = (await request.json()) as SyncCreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  const taskIds = (body?.taskIds ?? []).map((s) => s.trim()).filter(Boolean);
  if (!projectId || taskIds.length === 0) {
    return NextResponse.json(
      { error: 'projectId and taskIds[] are required' },
      { status: 400 },
    );
  }

  try {
    await requireProjectAccess(request, projectId);

    const projSnap = await adminDb.collection(PROJECTS_COLLECTION).doc(projectId).get();
    const listId = (projSnap.data() as { clickupListId?: string } | undefined)?.clickupListId;
    if (!listId) {
      // Project not bound — successful no-op so callers don't need to pre-check.
      return NextResponse.json({
        ok: true,
        skipped: 'list-not-bound',
        results: taskIds.map<SyncResult>((id) => ({ taskId: id, status: 'skipped', reason: 'list-not-bound' })),
      });
    }

    // List statuses (for forward status mapping) and team members (for
    // assignee email → ClickUp user id). Either may fail independently — we
    // degrade gracefully and still push the basic fields.
    const teamId = await loadClickUpTeamId();
    const [listInfo, members] = await Promise.all([
      fetchClickUpList(listId).catch((err) => {
        console.warn('[clickup-sync-create] fetchClickUpList failed', err);
        return null;
      }),
      teamId
        ? fetchTeamMembers(teamId).catch((err) => {
            console.warn('[clickup-sync-create] fetchTeamMembers failed', err);
            return [] as ClickUpMember[];
          })
        : Promise.resolve([] as ClickUpMember[]),
    ]);
    const emailToId = buildEmailToClickUpIdMap(members);

    const results: SyncResult[] = [];
    for (const taskId of taskIds) {
      const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
      const snap = await taskRef.get();
      if (!snap.exists) {
        results.push({ taskId, status: 'skipped', reason: 'not-found' });
        continue;
      }
      const data = snap.data() as {
        projectId?: string;
        title?: string;
        description?: string;
        priority?: TaskPriority;
        status?: TaskStatus;
        assignee?: string;
        dueDate?: string;
        tags?: string[];
        clickupTaskId?: string;
      } | undefined;

      if (!data || data.projectId !== projectId) {
        results.push({ taskId, status: 'skipped', reason: 'wrong-project' });
        continue;
      }
      if (data.clickupTaskId) {
        results.push({ taskId, status: 'skipped', reason: 'already-linked' });
        continue;
      }
      if (!data.title?.trim()) {
        results.push({ taskId, status: 'skipped', reason: 'empty-title' });
        continue;
      }

      const mappedStatus = data.status
        ? taskStatusToClickUpStatus(data.status, listInfo?.statuses)
        : undefined;
      const assigneeKey = data.assignee?.trim().toLowerCase();
      const assigneeId = assigneeKey ? emailToId.get(assigneeKey) : undefined;

      try {
        const created = await createClickUpTask(listId, {
          name: data.title,
          description: data.description,
          priority: data.priority,
          dueDate: data.dueDate,
          tags: data.tags,
          status: mappedStatus,
          assigneeIds: assigneeId !== undefined ? [assigneeId] : undefined,
        });

        await taskRef.update({
          clickupTaskId: created.id,
          clickupUrl: created.url ?? buildClickUpTaskUrl(created.id),
          clickupSyncedAt: Timestamp.now(),
          clickupSyncError: FieldValue.delete(),
          clickupSyncFailedAt: FieldValue.delete(),
          updatedAt: Timestamp.now(),
        });

        results.push({
          taskId,
          status: 'synced',
          clickupTaskId: created.id,
          clickupUrl: created.url ?? buildClickUpTaskUrl(created.id),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[clickup-sync-create] task push failed', { taskId, message });
        try {
          await taskRef.update({
            clickupSyncError: message.slice(0, 500),
            clickupSyncFailedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
        } catch (markErr) {
          console.error('[clickup-sync-create] failed to mark error state', markErr);
        }
        results.push({ taskId, status: 'failed', reason: message });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof ClickUpError) {
      return NextResponse.json(
        { error: 'ClickUp request failed', details: err.message },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-sync-create] failed:', message);
    return NextResponse.json({ error: 'Sync failed', details: message }, { status: 500 });
  }
}
