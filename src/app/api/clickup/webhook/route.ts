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
const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;

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

/** Find the project (if any) bound to a given ClickUp list id. */
async function findProjectForList(listId: string): Promise<string | null> {
  const snap = await adminDb
    .collection(PROJECTS_COLLECTION)
    .where('clickupListId', '==', listId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

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
  if (!taskId || !event.startsWith('task')) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Local task already linked? Look it up first; that determines whether this
  // is an update vs a candidate-for-create.
  const matches = await adminDb
    .collection(TASKS_COLLECTION)
    .where('clickupTaskId', '==', taskId)
    .limit(1)
    .get();
  const existing = matches.empty ? null : matches.docs[0];

  // taskDeleted is the easy case — no need to refetch.
  if (event === 'taskDeleted') {
    if (!existing) {
      return NextResponse.json({ ok: true, ignored: 'unlinked-and-deleted' });
    }
    await existing.ref.update({
      clickupTaskId: null,
      clickupUrl: null,
      clickupSyncedAt: null,
      source: 'manual',
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, action: 'unlinked-on-delete' });
  }

  // For create/update/move/etc, fetch the current ClickUp state — gives us the
  // canonical fields and (importantly) the current list id for routing.
  let task;
  try {
    task = await fetchClickUpTask(taskId);
  } catch (err) {
    if (err instanceof ClickUpError && err.status === 404) {
      // Task disappeared between webhook fire and our fetch — treat as delete.
      if (existing) {
        await existing.ref.update({
          clickupTaskId: null,
          clickupUrl: null,
          clickupSyncedAt: null,
          source: 'manual',
          updatedAt: Timestamp.now(),
        });
        return NextResponse.json({ ok: true, action: 'unlinked-on-404' });
      }
      return NextResponse.json({ ok: true, ignored: '404-unmatched' });
    }
    throw err;
  }

  const currentListId = task.list?.id ?? null;
  const patch = clickUpTaskToUpdate(task);
  const completedAtUpdate =
    patch.status === 'done' ? { completedAt: Timestamp.now() } : { completedAt: null };

  if (existing) {
    // Update path. If the task moved OUT of a linked list, unlink it (option A
    // behavior — keep the local row, drop the ClickUp link).
    const localData = existing.data() as { projectId?: string };
    const projectId = localData.projectId;
    let movedOutOfLinkedList = false;
    if (projectId) {
      const projSnap = await adminDb
        .collection(PROJECTS_COLLECTION)
        .doc(projectId)
        .get();
      const linkedListId = (projSnap.data() as { clickupListId?: string } | undefined)
        ?.clickupListId;
      if (linkedListId && currentListId && linkedListId !== currentListId) {
        movedOutOfLinkedList = true;
      }
    }

    if (movedOutOfLinkedList) {
      await existing.ref.update({
        clickupTaskId: null,
        clickupUrl: null,
        clickupSyncedAt: null,
        source: 'manual',
        updatedAt: Timestamp.now(),
      });
      return NextResponse.json({ ok: true, action: 'unlinked-list-moved-out' });
    }

    await existing.ref.update({
      ...patch,
      ...completedAtUpdate,
      clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
      clickupSyncedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, action: 'synced', event });
  }

  // No local task. If the current list is bound to a project, auto-create the
  // local task pre-linked. Otherwise it's just an unrelated workspace event.
  if (!currentListId) {
    return NextResponse.json({ ok: true, ignored: 'unlinked' });
  }
  const projectId = await findProjectForList(currentListId);
  if (!projectId) {
    return NextResponse.json({ ok: true, ignored: 'list-not-bound' });
  }

  const now = Timestamp.now();
  await adminDb.collection(TASKS_COLLECTION).add({
    projectId,
    title: patch.title ?? task.name ?? 'Untitled',
    description: patch.description,
    category: 'other',
    status: patch.status ?? 'todo',
    priority: patch.priority ?? 'medium',
    dueDate: patch.dueDate,
    tags: patch.tags ?? [],
    assignee: patch.assignee,
    source: 'clickup',
    clickupTaskId: taskId,
    clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
    clickupSyncedAt: now,
    order: Date.now(),
    completedAt: patch.status === 'done' ? now : null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'clickup-sync@system',
  });

  return NextResponse.json({ ok: true, action: 'created', projectId });
}
