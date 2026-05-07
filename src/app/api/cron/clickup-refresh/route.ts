import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  buildClickUpTaskUrl,
  ClickUpError,
  CLICKUP_TASK_EVENTS,
  clickUpTaskToUpdate,
  createWebhook,
  deleteWebhook,
  fetchClickUpTask,
  listWebhooks,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;

// Hard ceiling per run so a noisy refresh doesn't burn through the ClickUp rate
// limit (100 req/min per token). At 6 req/sec we comfortably stay under.
const MAX_REFRESHED_PER_RUN = 200;
const REQUEST_INTERVAL_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WebhookHealthResult {
  status: 'healthy' | 'recovered' | 'no-config' | 'check-failed' | 'recovery-failed';
  detail?: string;
}

/**
 * Detects when ClickUp has disabled or dropped our webhook (it auto-disables
 * after ~5 consecutive 5xx responses) and re-registers transparently. Without
 * this, a brief deploy or 502 can permanently break sync until someone notices
 * and clicks "Register" in the settings page.
 */
async function ensureWebhookHealthy(): Promise<WebhookHealthResult> {
  const snap = await adminDb
    .collection(APP_SECRETS_COLLECTION)
    .doc('clickup')
    .get();
  if (!snap.exists) return { status: 'no-config', detail: 'app_secrets/clickup missing' };

  const data = snap.data() as {
    webhookId?: string;
    teamId?: string;
    endpoint?: string;
  };
  const { webhookId, teamId, endpoint } = data;
  if (!webhookId || !teamId || !endpoint) {
    return { status: 'no-config', detail: 'webhookId/teamId/endpoint not set' };
  }

  let webhooks;
  try {
    webhooks = await listWebhooks(teamId);
  } catch (err) {
    return {
      status: 'check-failed',
      detail: err instanceof Error ? err.message : 'listWebhooks threw',
    };
  }

  const ours = webhooks.find((w) => w.id === webhookId);
  const isFailing = ours?.health?.status === 'failing';
  // Healthy = present and not flagged as failing by ClickUp.
  if (ours && !isFailing) return { status: 'healthy' };

  // Re-register at the same endpoint. If a stale "failing" entry exists, drop
  // it first so we don't accumulate duplicates.
  try {
    if (ours) {
      await deleteWebhook(ours.id).catch((err) => {
        console.warn('[clickup-refresh] could not delete failing webhook', err);
      });
    }
    const fresh = await createWebhook(teamId, endpoint, CLICKUP_TASK_EVENTS);
    await adminDb
      .collection(APP_SECRETS_COLLECTION)
      .doc('clickup')
      .set(
        {
          teamId,
          endpoint,
          webhookId: fresh.id,
          webhookSecret: fresh.secret,
          events: fresh.events ?? CLICKUP_TASK_EVENTS,
          registeredAt: Timestamp.now(),
        },
        { merge: true },
      );
    return {
      status: 'recovered',
      detail: ours ? `replaced failing webhook ${ours.id}` : `webhook ${webhookId} was missing`,
    };
  } catch (err) {
    return {
      status: 'recovery-failed',
      detail: err instanceof Error ? err.message : 'createWebhook threw',
    };
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const webhookHealth = await ensureWebhookHealthy();
  if (webhookHealth.status === 'recovered') {
    console.warn('[clickup-refresh] webhook auto-recovered:', webhookHealth.detail);
  } else if (webhookHealth.status === 'check-failed' || webhookHealth.status === 'recovery-failed') {
    console.error('[clickup-refresh] webhook health check failed:', webhookHealth.detail);
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
    webhook: webhookHealth,
  });
}
