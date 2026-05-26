import type { Task } from '@/types';

export const CLICKUP_SYNC_LOCK_TTL_MS = 2 * 60 * 1000;

export function isClickUpCreateSyncPending(
  task: Pick<Task, 'clickupSyncInFlightAt'>,
): boolean {
  if (!task.clickupSyncInFlightAt) return false;
  return Date.now() - task.clickupSyncInFlightAt.getTime() < CLICKUP_SYNC_LOCK_TTL_MS;
}
