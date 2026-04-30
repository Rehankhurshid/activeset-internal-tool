import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  buildClickUpTaskUrl,
  ClickUpError,
  clickUpTaskToUpdate,
  fetchClickUpTask,
  verifyClickUpSignature,
  type ClickUpWebhookPayload,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 30;

const APP_SECRETS_COLLECTION = COLLECTIONS.APP_SECRETS;
const TASKS_COLLECTION = COLLECTIONS.TASKS;

interface ClickUpAppSecrets {
  webhookSecret?: string;
  webhookId?: string;
  teamId?: string;
}

async function loadWebhookSecret(): Promise<string | null> {
  const snap = await adminDb.collection(APP_SECRETS_COLLECTION).doc('clickup').get();
  if (!snap.exists) return null;
  const data = snap.data() as ClickUpAppSecrets | undefined;
  return data?.webhookSecret ?? null;
}

export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  // Read raw body once — needed for signature verification AND JSON parsing.
  const rawBody = await request.text();

  const secret = await loadWebhookSecret();
  if (!secret) {
    console.error('[clickup-webhook] No webhook secret configured in app_secrets/clickup');
    return NextResponse.json({ error: 'Webhook not registered' }, { status: 503 });
  }

  const sig = request.headers.get('x-signature') || request.headers.get('X-Signature');
  if (!verifyClickUpSignature(rawBody, sig, secret)) {
    console.warn('[clickup-webhook] signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: ClickUpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ClickUpWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, task_id: taskId } = payload;
  if (!event) {
    return NextResponse.json({ error: 'Missing event' }, { status: 400 });
  }

  // Non-task events are ignored — we only subscribe to task events but
  // ClickUp can deliver list/folder events on shared workspaces.
  if (!taskId || !event.startsWith('task')) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Look up our local Task linked to this ClickUp task.
  const matches = await adminDb
    .collection(TASKS_COLLECTION)
    .where('clickupTaskId', '==', taskId)
    .limit(1)
    .get();

  if (matches.empty) {
    // Task not linked locally — common case (we don't mirror every ClickUp task,
    // only ones explicitly linked from the app). Acknowledge so ClickUp doesn't retry.
    return NextResponse.json({ ok: true, ignored: 'unlinked' });
  }

  const docRef = matches.docs[0].ref;

  if (event === 'taskDeleted') {
    // Don't delete our local task — just unlink and flip source back to manual
    // so the team retains the row (it may have local notes / tags).
    await docRef.update({
      clickupTaskId: null,
      clickupUrl: null,
      clickupSyncedAt: null,
      source: 'manual',
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, action: 'unlinked' });
  }

  try {
    const task = await fetchClickUpTask(taskId);
    const patch = clickUpTaskToUpdate(task);
    const completedAtUpdate =
      patch.status === 'done'
        ? { completedAt: Timestamp.now() }
        : { completedAt: null };
    await docRef.update({
      ...patch,
      ...completedAtUpdate,
      clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
      clickupSyncedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, action: 'synced', event });
  } catch (err) {
    const status = err instanceof ClickUpError ? (err.status ?? 502) : 500;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[clickup-webhook] sync failed:', message);
    return NextResponse.json({ error: 'Sync failed', details: message }, { status });
  }
}
