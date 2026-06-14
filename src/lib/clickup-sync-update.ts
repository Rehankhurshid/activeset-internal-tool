import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/constants';
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
import { db as adminDb } from '@/lib/firebase-admin';
import type { TaskPriority, TaskStatus } from '@/types';

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;
const MAX_STALE_RECONCILE_ATTEMPTS = 3;

/**
 * Patch shape from the client. Each key uses "absent vs explicit" semantics:
 * a key that is not present means "do not touch this field"; a key set to
 * null/undefined means "clear it" where ClickUp supports clearing.
 */
export interface SyncUpdatePatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  /** Single email; mirrors the app's current task model. */
  assignee?: string | null;
}

export interface SyncUpdateResult {
  ok: boolean;
  status?: 'synced' | 'failed' | 'stale-reconciled';
  skipped?: string;
  reason?: string;
  email?: string;
  pushed?: string[];
  attempts?: number;
}

interface TaskForUpdate {
  projectId?: string;
  clickupTaskId?: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  assignee?: string;
  clickupSyncRequestId?: string;
  clickupLastSyncedRequestId?: string;
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

function fullPatchFromTask(data: TaskForUpdate): SyncUpdatePatch {
  return {
    title: data.title,
    description: data.description ?? null,
    status: data.status,
    priority: data.priority,
    dueDate: data.dueDate ?? null,
    assignee: data.assignee ?? null,
  };
}

function requestIdOf(data: TaskForUpdate | undefined): string | null {
  return typeof data?.clickupSyncRequestId === 'string' && data.clickupSyncRequestId
    ? data.clickupSyncRequestId
    : null;
}

async function markSyncError(
  taskId: string,
  expectedRequestId: string | null,
  message: string,
): Promise<void> {
  try {
    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    await adminDb.runTransaction(async (tx) => {
      const latest = await tx.get(taskRef);
      if (!latest.exists) return;
      const latestData = latest.data() as TaskForUpdate | undefined;
      const latestRequestId = requestIdOf(latestData);
      if (expectedRequestId && latestRequestId !== expectedRequestId) return;
      tx.update(taskRef, {
        clickupSyncError: message.slice(0, 500),
        clickupSyncFailedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
  } catch (markErr) {
    console.error('[clickup-sync-update] failed to mark error', markErr);
  }
}

async function buildClickUpUpdateBody(
  projectId: string,
  clickupTaskId: string,
  patch: SyncUpdatePatch,
): Promise<{ body: Record<string, unknown>; failure?: SyncUpdateResult }> {
  const needsStatus = 'status' in patch && patch.status !== undefined;
  const needsAssignee = 'assignee' in patch;
  const teamId = needsAssignee ? await loadClickUpTeamId() : null;

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

  const body: Record<string, unknown> = {};

  if ('title' in patch && typeof patch.title === 'string') {
    const name = patch.title.trim();
    if (name) body.name = name;
  }
  if ('description' in patch) {
    body.description = patch.description ?? '';
  }
  if (needsStatus && patch.status) {
    const mapped = taskStatusToClickUpStatus(patch.status, listInfo?.statuses);
    if (mapped) body.status = mapped;
  }
  if ('priority' in patch && patch.priority) {
    body.priority = taskPriorityToClickUp(patch.priority);
  }
  if ('dueDate' in patch) {
    const due = patch.dueDate;
    if (due === null || due === undefined || due === '') {
      body.due_date = null;
      body.due_date_time = false;
    } else {
      const ms = isoDateToClickUpMs(due);
      if (ms !== null) {
        body.due_date = ms;
        body.due_date_time = false;
      }
    }
  }

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
        return {
          body,
          failure: {
            ok: false,
            status: 'failed',
            reason: 'email-not-in-workspace',
            email: desiredEmail,
          },
        };
      }
    }

    const targetIds = desiredId !== undefined ? new Set([desiredId]) : new Set<number>();
    const removeIds = currentAssigneeIds.filter((id) => !targetIds.has(id));
    const addIds =
      desiredId !== undefined && !currentAssigneeIds.includes(desiredId) ? [desiredId] : [];
    if (addIds.length > 0 || removeIds.length > 0) {
      body.assignees = { add: addIds, rem: removeIds };
    }
  }

  return { body };
}

async function finalizeSync(
  taskId: string,
  appliedRequestId: string | null,
): Promise<{ stale: false } | { stale: true; latestRequestId: string | null }> {
  const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
  return adminDb.runTransaction(async (tx) => {
    const latest = await tx.get(taskRef);
    if (!latest.exists) return { stale: false as const };
    const latestData = latest.data() as TaskForUpdate | undefined;
    const latestRequestId = requestIdOf(latestData);

    if (appliedRequestId && latestRequestId !== appliedRequestId) {
      return { stale: true as const, latestRequestId };
    }

    tx.update(taskRef, {
      clickupSyncedAt: Timestamp.now(),
      clickupLastSyncedRequestId: appliedRequestId,
      clickupSyncError: FieldValue.delete(),
      clickupSyncFailedAt: FieldValue.delete(),
      clickupSyncInFlightAt: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
    return { stale: false as const };
  });
}

export async function syncTaskUpdateToClickUp(
  projectId: string,
  taskId: string,
  options: {
    patch?: SyncUpdatePatch;
    expectedRequestId?: string | null;
    forceFullState?: boolean;
  } = {},
): Promise<SyncUpdateResult> {
  let patch = options.patch;
  let forceFullState = Boolean(options.forceFullState);
  let expectedRequestId = options.expectedRequestId ?? null;

  for (let attempt = 1; attempt <= MAX_STALE_RECONCILE_ATTEMPTS; attempt += 1) {
    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    const snap = await taskRef.get();
    if (!snap.exists) {
      return { ok: false, reason: 'Task not found' };
    }

    const taskData = snap.data() as TaskForUpdate | undefined;
    if (!taskData || taskData.projectId !== projectId) {
      return { ok: false, reason: 'Task does not belong to this project' };
    }

    const clickupTaskId = taskData.clickupTaskId;
    if (!clickupTaskId) {
      return { ok: true, skipped: 'not-linked' };
    }

    const currentRequestId = requestIdOf(taskData);
    if (
      expectedRequestId &&
      currentRequestId &&
      currentRequestId !== expectedRequestId &&
      !forceFullState
    ) {
      return { ok: true, skipped: 'stale-request' };
    }

    const requestIdToApply = forceFullState ? currentRequestId : expectedRequestId ?? currentRequestId;
    const patchToPush = forceFullState || !patch ? fullPatchFromTask(taskData) : patch;
    const { body, failure } = await buildClickUpUpdateBody(projectId, clickupTaskId, patchToPush);

    if (failure) {
      const message = `Assignee "${failure.email}" is not a member of the ClickUp workspace`;
      await markSyncError(taskId, requestIdToApply, message);
      return failure;
    }

    if (Object.keys(body).length === 0) {
      return { ok: true, skipped: 'nothing-to-push' };
    }

    try {
      await updateClickUpTask(clickupTaskId, body);
    } catch (err) {
      if (err instanceof ClickUpError) {
        await markSyncError(taskId, requestIdToApply, err.message);
      }
      throw err;
    }

    const finalized = await finalizeSync(taskId, requestIdToApply);
    if (!finalized.stale) {
      return {
        ok: true,
        status: attempt > 1 ? 'stale-reconciled' : 'synced',
        pushed: Object.keys(body),
        attempts: attempt,
      };
    }

    // A newer app edit landed while this request was writing to ClickUp.
    // Push the full latest local state so an older network response cannot win.
    expectedRequestId = finalized.latestRequestId;
    patch = undefined;
    forceFullState = true;
  }

  return {
    ok: false,
    status: 'failed',
    reason: 'too-many-stale-sync-attempts',
    attempts: MAX_STALE_RECONCILE_ATTEMPTS,
  };
}
