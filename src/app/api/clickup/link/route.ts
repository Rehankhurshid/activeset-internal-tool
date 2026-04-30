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
  fetchClickUpTask,
  parseClickUpTaskId,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TASKS_COLLECTION = COLLECTIONS.TASKS;

interface LinkBody {
  taskId?: string;
  projectId?: string;
  /** ClickUp URL or raw task id */
  clickupRef?: string;
}

export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: LinkBody | null = null;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const taskId = body?.taskId?.trim();
  const projectId = body?.projectId?.trim();
  const clickupRef = body?.clickupRef?.trim();
  if (!taskId || !projectId || !clickupRef) {
    return NextResponse.json(
      { error: 'taskId, projectId, and clickupRef are required' },
      { status: 400 },
    );
  }

  const clickupTaskId = parseClickUpTaskId(clickupRef);
  if (!clickupTaskId) {
    return NextResponse.json(
      { error: 'Could not extract a ClickUp task id from the provided value' },
      { status: 400 },
    );
  }

  try {
    await requireProjectAccess(request, projectId);

    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const taskData = taskSnap.data() as { projectId?: string } | undefined;
    if (taskData?.projectId !== projectId) {
      return NextResponse.json({ error: 'Task does not belong to this project' }, { status: 403 });
    }

    // Reject if a different task is already linked to this ClickUp id.
    const existing = await adminDb
      .collection(TASKS_COLLECTION)
      .where('clickupTaskId', '==', clickupTaskId)
      .limit(1)
      .get();
    if (!existing.empty && existing.docs[0].id !== taskId) {
      return NextResponse.json(
        { error: 'Another task in this workspace is already linked to that ClickUp task' },
        { status: 409 },
      );
    }

    const clickupTask = await fetchClickUpTask(clickupTaskId);
    const patch = clickUpTaskToUpdate(clickupTask);
    const completedAtUpdate =
      patch.status === 'done' ? { completedAt: Timestamp.now() } : { completedAt: null };

    await taskRef.update({
      ...patch,
      ...completedAtUpdate,
      source: 'clickup',
      clickupTaskId,
      clickupUrl: clickupTask.url ?? buildClickUpTaskUrl(clickupTaskId),
      clickupSyncedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      clickupTaskId,
      url: clickupTask.url ?? buildClickUpTaskUrl(clickupTaskId),
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
    console.error('[clickup-link] failed:', message);
    return NextResponse.json({ error: 'Link failed', details: message }, { status: 500 });
  }
}

/** Unlink — leaves the task in place but removes ClickUp connection. */
export async function DELETE(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId')?.trim();
  const projectId = url.searchParams.get('projectId')?.trim();
  if (!taskId || !projectId) {
    return NextResponse.json({ error: 'taskId and projectId are required' }, { status: 400 });
  }

  try {
    await requireProjectAccess(request, projectId);
    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    const snap = await taskRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const data = snap.data() as { projectId?: string } | undefined;
    if (data?.projectId !== projectId) {
      return NextResponse.json({ error: 'Task does not belong to this project' }, { status: 403 });
    }

    await taskRef.update({
      clickupTaskId: null,
      clickupUrl: null,
      clickupSyncedAt: null,
      source: 'manual',
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-unlink] failed:', message);
    return NextResponse.json({ error: 'Unlink failed', details: message }, { status: 500 });
  }
}
