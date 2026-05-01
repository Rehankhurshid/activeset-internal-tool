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
  type ClickUpMember,
  fetchClickUpList,
  fetchClickUpTask,
  fetchTeamMembers,
  isoDateToClickUpMs,
  taskPriorityToClickUp,
  taskStatusToClickUpStatus,
  updateClickUpTask,
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

/**
 * Patch shape from the client. Each key uses "absent vs explicit" semantics:
 * a key that is *not present* means "don't touch this field"; a key set to
 * `null`/`undefined` means "clear it" (where ClickUp supports clearing).
 */
interface SyncUpdatePatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  /** Single email; Phase 1. Phase 2 will switch to assignees: string[]. */
  assignee?: string | null;
}

interface SyncUpdateBody {
  projectId?: string;
  taskId?: string;
  patch?: SyncUpdatePatch;
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
 * Push a partial update to a linked ClickUp task. Handles any subset of
 * `{ title, description, status, priority, dueDate, assignee }`. Failures
 * stamp `clickupSyncError` / `clickupSyncFailedAt` on the local task; the
 * local edit is preserved either way.
 */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: SyncUpdateBody | null = null;
  try {
    body = (await request.json()) as SyncUpdateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  const taskId = body?.taskId?.trim();
  const patch = body?.patch ?? {};
  if (!projectId || !taskId) {
    return NextResponse.json(
      { error: 'projectId and taskId are required' },
      { status: 400 },
    );
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, skipped: 'empty-patch' });
  }

  try {
    await requireProjectAccess(request, projectId);

    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    const snap = await taskRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const taskData = snap.data() as
      | { projectId?: string; clickupTaskId?: string }
      | undefined;
    if (!taskData || taskData.projectId !== projectId) {
      return NextResponse.json({ error: 'Task does not belong to this project' }, { status: 403 });
    }
    const clickupTaskId = taskData.clickupTaskId;
    if (!clickupTaskId) {
      return NextResponse.json({ ok: true, skipped: 'not-linked' });
    }

    // We need: list (for status mapping if status is in patch), members
    // (for assignee email→id if assignee is in patch), and current ClickUp
    // task (for assignee diff). Skip fetches we don't need.
    const needsStatus = 'status' in patch && patch.status !== undefined;
    const needsAssignee = 'assignee' in patch;

    const teamId = needsAssignee ? await loadClickUpTeamId() : null;

    // Pull project's bound list id (for status mapping). We only need this if
    // `needsStatus` is true.
    let listId: string | null = null;
    if (needsStatus) {
      const projSnap = await adminDb.collection(PROJECTS_COLLECTION).doc(projectId).get();
      listId = (projSnap.data() as { clickupListId?: string } | undefined)?.clickupListId ?? null;
    }

    const [listInfo, members, clickupTask] = await Promise.all([
      needsStatus && listId
        ? fetchClickUpList(listId).catch((err) => {
            console.warn('[clickup-sync-update] fetchClickUpList failed', err);
            return null;
          })
        : Promise.resolve(null),
      needsAssignee && teamId
        ? fetchTeamMembers(teamId).catch((err) => {
            console.warn('[clickup-sync-update] fetchTeamMembers failed', err);
            return [] as ClickUpMember[];
          })
        : Promise.resolve([] as ClickUpMember[]),
      needsAssignee
        ? fetchClickUpTask(clickupTaskId).catch((err) => {
            console.warn('[clickup-sync-update] fetchClickUpTask failed', err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    // Build the ClickUp PUT body field-by-field.
    const cuBody: Record<string, unknown> = {};

    if ('title' in patch && typeof patch.title === 'string') {
      cuBody.name = patch.title;
    }
    if ('description' in patch) {
      // ClickUp uses empty string to clear — null/undefined treated the same.
      cuBody.description = patch.description ?? '';
    }
    if (needsStatus && patch.status) {
      const mapped = taskStatusToClickUpStatus(patch.status, listInfo?.statuses);
      if (mapped) cuBody.status = mapped;
      // No match → silently skip; ClickUp keeps its current status.
    }
    if ('priority' in patch && patch.priority) {
      cuBody.priority = taskPriorityToClickUp(patch.priority);
    }
    if ('dueDate' in patch) {
      const due = patch.dueDate;
      if (due === null || due === undefined || due === '') {
        cuBody.due_date = null;
        cuBody.due_date_time = false;
      } else {
        const ms = isoDateToClickUpMs(due);
        if (ms !== null) {
          cuBody.due_date = ms;
          cuBody.due_date_time = false;
        }
      }
    }

    // Assignee diff (Phase 1 single-email overwrite semantics — see sync-assignee
    // for the reasoning, mirrored here).
    let assigneeEmailNotInWorkspace: string | null = null;
    if (needsAssignee) {
      const desiredEmail = (patch.assignee ?? '').trim().toLowerCase() || null;
      const emailToId = buildEmailToClickUpIdMap(members);
      const currentAssigneeIds: number[] = (clickupTask?.assignees ?? [])
        .map((a) => a.id)
        .filter((id): id is number => typeof id === 'number');

      let desiredId: number | undefined;
      if (desiredEmail) {
        desiredId = emailToId.get(desiredEmail);
        if (desiredId === undefined) {
          assigneeEmailNotInWorkspace = desiredEmail;
        }
      }

      if (assigneeEmailNotInWorkspace === null) {
        const targetIds = desiredId !== undefined ? new Set([desiredId]) : new Set<number>();
        const removeIds = currentAssigneeIds.filter((id) => !targetIds.has(id));
        const addIds =
          desiredId !== undefined && !currentAssigneeIds.includes(desiredId) ? [desiredId] : [];
        if (addIds.length > 0 || removeIds.length > 0) {
          cuBody.assignees = { add: addIds, rem: removeIds };
        }
      }
    }

    // Email-not-in-workspace: don't clobber ClickUp; stamp error and bail.
    if (assigneeEmailNotInWorkspace) {
      const message = `Assignee "${assigneeEmailNotInWorkspace}" is not a member of the ClickUp workspace`;
      await taskRef.update({
        clickupSyncError: message.slice(0, 500),
        clickupSyncFailedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return NextResponse.json(
        { ok: false, status: 'failed', reason: 'email-not-in-workspace', email: assigneeEmailNotInWorkspace },
        { status: 200 },
      );
    }

    if (Object.keys(cuBody).length === 0) {
      // Nothing actually mappable changed (e.g. status with no list match).
      return NextResponse.json({ ok: true, skipped: 'nothing-to-push' });
    }

    await updateClickUpTask(clickupTaskId, cuBody);

    await taskRef.update({
      clickupSyncedAt: Timestamp.now(),
      clickupSyncError: FieldValue.delete(),
      clickupSyncFailedAt: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, status: 'synced', pushed: Object.keys(cuBody) });
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
        console.error('[clickup-sync-update] failed to mark error', markErr);
      }
      return NextResponse.json(
        { error: 'ClickUp request failed', details: err.message },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-sync-update] failed:', message);
    return NextResponse.json({ error: 'Sync failed', details: message }, { status: 500 });
  }
}
