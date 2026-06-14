import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/constants';
import {
  buildClickUpTaskUrl,
  buildEmailToClickUpIdMap,
  createClickUpTask,
  fetchClickUpList,
  fetchTeamMembers,
  taskStatusToClickUpStatus,
  type ClickUpMember,
} from '@/lib/clickup';
import { db as adminDb } from '@/lib/firebase-admin';
import { syncTaskUpdateToClickUp } from '@/lib/clickup-sync-update';
import type { TaskPriority, TaskStatus } from '@/types';

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;
const SYNC_LOCK_TTL_MS = 2 * 60 * 1000;

export interface SyncCreateResult {
  taskId: string;
  status: 'synced' | 'skipped' | 'failed';
  reason?: string;
  clickupTaskId?: string;
  clickupUrl?: string;
}

interface TaskForCreate {
  projectId?: string;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignee?: string;
  dueDate?: string;
  tags?: string[];
  clickupTaskId?: string;
  clickupSyncRequestId?: string;
  clickupSyncInFlightAt?: Timestamp;
}

type ClaimResult =
  | { kind: 'claimed'; data: TaskForCreate }
  | { kind: 'result'; result: SyncCreateResult };

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

function timestampMs(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const maybeTimestamp = value as { toMillis?: () => number };
  if (typeof maybeTimestamp.toMillis !== 'function') return null;
  const ms = maybeTimestamp.toMillis();
  return Number.isFinite(ms) ? ms : null;
}

export async function syncCreatedTasksToClickUp(
  projectId: string,
  taskIds: string[],
): Promise<{ ok: true; skipped?: string; results: SyncCreateResult[] }> {
  const projSnap = await adminDb.collection(PROJECTS_COLLECTION).doc(projectId).get();
  const listId = (projSnap.data() as { clickupListId?: string } | undefined)?.clickupListId;
  if (!listId) {
    return {
      ok: true,
      skipped: 'list-not-bound',
      results: taskIds.map<SyncCreateResult>((id) => ({ taskId: id, status: 'skipped', reason: 'list-not-bound' })),
    };
  }

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

  const results: SyncCreateResult[] = [];
  for (const taskId of taskIds) {
    const taskRef = adminDb.collection(TASKS_COLLECTION).doc(taskId);
    const claim = await adminDb.runTransaction<ClaimResult>(async (tx) => {
      const snap = await tx.get(taskRef);
      if (!snap.exists) {
        return { kind: 'result', result: { taskId, status: 'skipped', reason: 'not-found' } };
      }
      const data = snap.data() as TaskForCreate | undefined;

      if (!data || data.projectId !== projectId) {
        return { kind: 'result', result: { taskId, status: 'skipped', reason: 'wrong-project' } };
      }
      if (data.clickupTaskId) {
        return { kind: 'result', result: { taskId, status: 'skipped', reason: 'already-linked' } };
      }
      if (!data.title?.trim()) {
        return { kind: 'result', result: { taskId, status: 'skipped', reason: 'empty-title' } };
      }

      const lockedAt = timestampMs(data.clickupSyncInFlightAt);
      if (lockedAt !== null && Date.now() - lockedAt < SYNC_LOCK_TTL_MS) {
        return { kind: 'result', result: { taskId, status: 'skipped', reason: 'sync-in-progress' } };
      }

      const now = Timestamp.now();
      tx.update(taskRef, {
        clickupSyncInFlightAt: now,
        updatedAt: now,
      });
      return { kind: 'claimed', data };
    });

    if (claim.kind === 'result') {
      results.push(claim.result);
      continue;
    }

    // Re-read after claiming so quick edits made immediately after task
    // creation are included in the ClickUp create payload.
    const freshSnap = await taskRef.get();
    const data = freshSnap.data() as TaskForCreate | undefined;
    if (!freshSnap.exists) {
      results.push({ taskId, status: 'skipped', reason: 'not-found' });
      continue;
    }
    if (!data || data.projectId !== projectId) {
      await taskRef.update({
        clickupSyncInFlightAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
      results.push({ taskId, status: 'skipped', reason: 'wrong-project' });
      continue;
    }
    if (data.clickupTaskId) {
      await taskRef.update({
        clickupSyncInFlightAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
      results.push({ taskId, status: 'skipped', reason: 'already-linked' });
      continue;
    }

    const syncRequestIdUsed = data.clickupSyncRequestId ?? null;
    const title = data.title?.trim();
    if (!title) {
      await taskRef.update({
        clickupSyncInFlightAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
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
        name: title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate,
        tags: data.tags,
        status: mappedStatus,
        assigneeIds: assigneeId !== undefined ? [assigneeId] : undefined,
      });
      const createdUrl = created.url ?? buildClickUpTaskUrl(created.id);

      const linkResult = await adminDb.runTransaction<
        | { kind: 'linked'; latestRequestId: string | null }
        | { kind: 'conflict' | 'missing' }
      >(async (tx) => {
        const latest = await tx.get(taskRef);
        if (!latest.exists) return { kind: 'missing' };
        const latestData = latest.data() as TaskForCreate | undefined;
        if (!latestData || latestData.projectId !== projectId) return { kind: 'missing' };
        if (latestData.clickupTaskId && latestData.clickupTaskId !== created.id) {
          const message = `Created ClickUp task ${created.id}, but this local task was linked to another ClickUp task before sync finished.`;
          tx.update(taskRef, {
            clickupSyncError: message.slice(0, 500),
            clickupSyncFailedAt: Timestamp.now(),
            clickupSyncInFlightAt: FieldValue.delete(),
            updatedAt: Timestamp.now(),
          });
          return { kind: 'conflict' };
        }
        const latestRequestId = latestData.clickupSyncRequestId ?? null;
        tx.update(taskRef, {
          clickupTaskId: created.id,
          clickupUrl: createdUrl,
          clickupSyncedAt: Timestamp.now(),
          clickupLastSyncedRequestId: syncRequestIdUsed,
          clickupSyncError: FieldValue.delete(),
          clickupSyncFailedAt: FieldValue.delete(),
          clickupSyncInFlightAt: FieldValue.delete(),
          updatedAt: Timestamp.now(),
        });
        return { kind: 'linked', latestRequestId };
      });

      if (linkResult.kind === 'linked') {
        let reconcileError: string | undefined;
        if (linkResult.latestRequestId !== syncRequestIdUsed) {
          try {
            const reconcile = await syncTaskUpdateToClickUp(projectId, taskId, {
              expectedRequestId: linkResult.latestRequestId,
              forceFullState: true,
            });
            if (!reconcile.ok) {
              reconcileError = reconcile.reason ?? 'post-create-reconcile-failed';
            }
          } catch (err) {
            reconcileError = err instanceof Error ? err.message : 'post-create-reconcile-failed';
          }
        }

        results.push({
          taskId,
          status: reconcileError ? 'failed' : 'synced',
          reason: reconcileError,
          clickupTaskId: created.id,
          clickupUrl: createdUrl,
        });
      } else {
        results.push({ taskId, status: 'failed', reason: `clickup-task-created-but-${linkResult.kind}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[clickup-sync-create] task push failed', { taskId, message });
      try {
        await taskRef.update({
          clickupSyncError: message.slice(0, 500),
          clickupSyncFailedAt: Timestamp.now(),
          clickupSyncInFlightAt: FieldValue.delete(),
          updatedAt: Timestamp.now(),
        });
      } catch (markErr) {
        console.error('[clickup-sync-create] failed to mark error state', markErr);
      }
      results.push({ taskId, status: 'failed', reason: message });
    }
  }

  return { ok: true, results };
}
