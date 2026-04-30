import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  buildClickUpTaskUrl,
  ClickUpError,
  clickUpTaskToUpdate,
  fetchClickUpTask,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TASKS_COLLECTION = COLLECTIONS.TASKS;

// Hard ceiling per run so a noisy refresh doesn't burn through the ClickUp rate
// limit (100 req/min per token). At 6 req/sec we comfortably stay under.
const MAX_REFRESHED_PER_RUN = 200;
const REQUEST_INTERVAL_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const linked = await adminDb
    .collection(TASKS_COLLECTION)
    .where('clickupTaskId', '!=', null)
    .limit(MAX_REFRESHED_PER_RUN)
    .get();

  let synced = 0;
  let unlinked = 0;
  let errors = 0;

  for (const doc of linked.docs) {
    const taskId = (doc.data() as { clickupTaskId?: string }).clickupTaskId;
    if (!taskId) continue;

    try {
      const task = await fetchClickUpTask(taskId);
      const patch = clickUpTaskToUpdate(task);
      const completedAtUpdate =
        patch.status === 'done' ? { completedAt: Timestamp.now() } : { completedAt: null };
      await doc.ref.update({
        ...patch,
        ...completedAtUpdate,
        clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
        clickupSyncedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      synced += 1;
    } catch (err) {
      // 404 → ClickUp task deleted on their side. Unlink locally so the row stays
      // editable but no longer syncs.
      if (err instanceof ClickUpError && err.status === 404) {
        await doc.ref.update({
          clickupTaskId: null,
          clickupUrl: null,
          clickupSyncedAt: null,
          source: 'manual',
          updatedAt: Timestamp.now(),
        });
        unlinked += 1;
      } else {
        errors += 1;
        console.error('[clickup-refresh] failed to sync', taskId, err);
      }
    }

    await sleep(REQUEST_INTERVAL_MS);
  }

  return NextResponse.json({
    ok: true,
    examined: linked.size,
    synced,
    unlinked,
    errors,
  });
}
