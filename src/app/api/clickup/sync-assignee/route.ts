import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import {
  buildEmailToClickUpIdMap,
  ClickUpError,
  fetchClickUpTask,
  fetchTeamMembers,
  updateClickUpTaskAssignees,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;

interface SyncAssigneeBody {
  projectId?: string;
  taskId?: string;
}

async function loadClickUpTeamId(): Promise<string | null> {
  try {
    const snap = await adminDb.collection(APP_SECRETS_COLLECTION).doc('clickup').get();
    if (!snap.exists) return null;
    return (snap.data() as { teamId?: string } | undefined)?.teamId ?? null;
  } catch {
    return null;
  }
}

/**
 * Push the local task's `assignee` (single email) to ClickUp as the sole
 * assignee. Implements **option A overwrite semantics** — any other ClickUp
 * assignees on the task are removed, leaving exactly the app-assigned person
 * (or no one, if the local assignee was cleared).
 *
 * If the local assignee email doesn't resolve to a ClickUp workspace member,
 * we leave ClickUp's assignees untouched and stamp `clickupSyncError` so the
 * mismatch is visible. This avoids losing ClickUp state for emails that don't
 * exist in the workspace (external collaborators, etc.).
 */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: SyncAssigneeBody | null = null;
  try {
    body = (await request.json()) as SyncAssigneeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  const taskId = body?.taskId?.trim();
  if (!projectId || !taskId) {
    return NextResponse.json(
      { error: 'projectId and taskId are required' },
      { status: 400 },
    );
  }

  try {
    await requireProjectAccess(request, projectId);

    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    const snap = await taskRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const data = snap.data() as
      | { projectId?: string; assignee?: string; clickupTaskId?: string }
      | undefined;
    if (!data || data.projectId !== projectId) {
      return NextResponse.json({ error: 'Task does not belong to this project' }, { status: 403 });
    }
    const clickupTaskId = data.clickupTaskId;
    if (!clickupTaskId) {
      // Not linked yet — nothing to do, success no-op.
      return NextResponse.json({ ok: true, skipped: 'not-linked' });
    }

    const teamId = await loadClickUpTeamId();
    if (!teamId) {
      return NextResponse.json(
        { ok: true, skipped: 'no-team-id', warning: 'Set teamId in app_secrets/clickup' },
      );
    }

    const desiredEmail = data.assignee?.trim().toLowerCase() || null;

    // Pull the live ClickUp task (for current assignees) and team members
    // (for the email→id map) in parallel.
    const [clickupTask, members] = await Promise.all([
      fetchClickUpTask(clickupTaskId),
      fetchTeamMembers(teamId),
    ]);
    const emailToId = buildEmailToClickUpIdMap(members);

    const currentAssigneeIds: number[] = (clickupTask.assignees ?? [])
      .map((a) => a.id)
      .filter((id): id is number => typeof id === 'number');

    let desiredId: number | undefined;
    if (desiredEmail) {
      desiredId = emailToId.get(desiredEmail);
      if (desiredId === undefined) {
        // Email doesn't map to a ClickUp member — refuse to clobber ClickUp state.
        const message = `Assignee "${desiredEmail}" is not a member of the ClickUp workspace`;
        await taskRef.update({
          clickupSyncError: message.slice(0, 500),
          clickupSyncFailedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        return NextResponse.json({ ok: false, status: 'failed', reason: 'email-not-in-workspace' }, { status: 200 });
      }
    }

    // Compute the diff: target = [desiredId] (or [] if cleared).
    const targetIds = desiredId !== undefined ? new Set([desiredId]) : new Set<number>();
    const removeIds = currentAssigneeIds.filter((id) => !targetIds.has(id));
    const addIds = desiredId !== undefined && !currentAssigneeIds.includes(desiredId) ? [desiredId] : [];

    if (addIds.length === 0 && removeIds.length === 0) {
      // Already in sync — clear any stale error state and return.
      await taskRef.update({
        clickupSyncError: FieldValue.delete(),
        clickupSyncFailedAt: FieldValue.delete(),
        clickupSyncedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return NextResponse.json({ ok: true, status: 'noop' });
    }

    await updateClickUpTaskAssignees(clickupTaskId, addIds, removeIds);

    await taskRef.update({
      clickupSyncedAt: Timestamp.now(),
      clickupSyncError: FieldValue.delete(),
      clickupSyncFailedAt: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, status: 'synced', addIds, removeIds });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof ClickUpError) {
      try {
        await adminDb.collection(TASKS_COLLECTION).doc(taskId).update({
          clickupSyncError: err.message.slice(0, 500),
          clickupSyncFailedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } catch (markErr) {
        console.error('[clickup-sync-assignee] failed to mark error', markErr);
      }
      return NextResponse.json(
        { error: 'ClickUp request failed', details: err.message },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-sync-assignee] failed:', message);
    return NextResponse.json({ error: 'Sync failed', details: message }, { status: 500 });
  }
}
