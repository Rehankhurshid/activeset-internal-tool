import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
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
import { syncTaskUpdateToClickUp } from '@/lib/clickup-sync-update';
import {
  buildClickUpUnlinkPatch,
  chooseCanonicalClickUpDoc,
  isDisposableClickUpMirror,
  localClickUpTaskDocFromSnapshot,
  type LocalClickUpTaskDoc,
} from '@/lib/clickup-local-mirrors';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;

// Hard ceiling per run so a noisy refresh doesn't burn through the ClickUp rate
// limit (100 req/min per token). At 6 req/sec we comfortably stay under.
const MAX_REFRESHED_PER_RUN = 200;
const REQUEST_INTERVAL_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cleanupLocalClickUpMirrors(
  mirrors: LocalClickUpTaskDoc[],
  keepId: string | null,
  now: Timestamp,
): Promise<number> {
  let batch = adminDb.batch();
  let writes = 0;
  let cleaned = 0;

  for (const mirror of mirrors) {
    if (keepId && mirror.id === keepId) continue;
    if (isDisposableClickUpMirror(mirror)) {
      batch.delete(mirror.ref);
    } else {
      batch.update(mirror.ref, buildClickUpUnlinkPatch(now));
    }
    writes += 1;
    cleaned += 1;

    if (writes >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      writes = 0;
    }
  }

  if (writes > 0) {
    await batch.commit();
  }

  return cleaned;
}

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
  let deduped = 0;
  let errors = 0;
  const projectListCache = new Map<string, string | null>();
  const linkedMirrors = linked.docs.map(localClickUpTaskDocFromSnapshot);
  const mirrorsByClickUpId = new Map<string, LocalClickUpTaskDoc[]>();
  for (const mirror of linkedMirrors) {
    const taskId = mirror.data.clickupTaskId;
    if (!taskId) continue;
    const mirrors = mirrorsByClickUpId.get(taskId) ?? [];
    mirrors.push(mirror);
    mirrorsByClickUpId.set(taskId, mirrors);
  }

  const canonicalMirrors: LocalClickUpTaskDoc[] = [];
  for (const mirrors of mirrorsByClickUpId.values()) {
    const canonical = chooseCanonicalClickUpDoc(mirrors);
    if (!canonical) continue;
    canonicalMirrors.push(canonical);
    deduped += await cleanupLocalClickUpMirrors(mirrors, canonical.id, Timestamp.now());
  }

  async function getProjectClickUpListId(projectId: string): Promise<string | null> {
    if (projectListCache.has(projectId)) {
      return projectListCache.get(projectId) ?? null;
    }
    const projectSnap = await adminDb
      .collection(PROJECTS_COLLECTION)
      .doc(projectId)
      .get();
    const listId = (projectSnap.data() as { clickupListId?: string | null } | undefined)
      ?.clickupListId ?? null;
    projectListCache.set(projectId, listId);
    return listId;
  }

  for (const doc of canonicalMirrors) {
    const docData = doc.data;
    const taskId = docData.clickupTaskId;
    if (!taskId) continue;

    try {
      const pendingLocalRequest =
        docData.clickupSyncRequestId &&
        docData.clickupLastSyncedRequestId !== docData.clickupSyncRequestId;
      if (docData.projectId && pendingLocalRequest) {
        const result = await syncTaskUpdateToClickUp(docData.projectId, doc.id, {
          expectedRequestId: docData.clickupSyncRequestId,
          forceFullState: true,
        });
        if (result.ok) synced += 1;
        else errors += 1;
        await sleep(REQUEST_INTERVAL_MS);
        continue;
      }

      const task = await fetchClickUpTask(taskId);
      if (docData.projectId && task.list?.id) {
        const linkedListId = await getProjectClickUpListId(docData.projectId);
        if (linkedListId && linkedListId !== task.list.id) {
          unlinked += await cleanupLocalClickUpMirrors([doc], null, Timestamp.now());
          await sleep(REQUEST_INTERVAL_MS);
          continue;
        }
      }
      const patch = clickUpTaskToUpdate(task);
      const completedAtUpdate =
        patch.status === 'done' ? { completedAt: Timestamp.now() } : { completedAt: null };
      await doc.ref.update({
        ...patch,
        ...completedAtUpdate,
        clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
        clickupSyncedAt: Timestamp.now(),
        clickupLastSyncedRequestId: docData.clickupSyncRequestId ?? null,
        clickupSyncError: FieldValue.delete(),
        clickupSyncFailedAt: FieldValue.delete(),
        clickupSyncInFlightAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
      synced += 1;
    } catch (err) {
      // 404 → ClickUp task deleted on their side. Remove imported mirrors and
      // unlink manual-origin tasks so local-only work is not silently lost.
      if (err instanceof ClickUpError && err.status === 404) {
        unlinked += await cleanupLocalClickUpMirrors([doc], null, Timestamp.now());
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
    deduped,
    errors,
    webhook: webhookHealth,
  });
}
