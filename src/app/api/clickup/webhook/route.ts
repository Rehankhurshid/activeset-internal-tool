import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
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
import { syncTaskUpdateToClickUp } from '@/lib/clickup-sync-update';
import {
  buildClickUpUnlinkPatch,
  chooseCanonicalClickUpDoc,
  isDisposableClickUpMirror,
  localClickUpTaskDocFromSnapshot,
  type LocalClickUpTaskDoc,
} from '@/lib/clickup-local-mirrors';

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

export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    // Acknowledge so ClickUp doesn't trip its auto-disable threshold while the
    // server is briefly misconfigured. The cron's webhook health check will
    // re-register a fresh webhook once credentials come back.
    console.error('[clickup-webhook] Firebase admin not configured');
    return NextResponse.json({ ok: true, ignored: 'admin-unconfigured' });
  }

  const rawBody = await request.text();

  const secret = await loadWebhookSecret().catch((err) => {
    console.error('[clickup-webhook] failed to load webhook secret', err);
    return null;
  });
  if (!secret) {
    // No secret = we can't verify, but returning 5xx would let ClickUp
    // auto-disable us. Ack and rely on cron re-registration.
    return NextResponse.json({ ok: true, ignored: 'no-secret' });
  }

  const sig = request.headers.get('x-signature') || request.headers.get('X-Signature');
  if (!verifyClickUpSignature(rawBody, sig, secret)) {
    // Signature mismatch IS a real misconfiguration we want to surface — the
    // cron's webhook health check will detect ClickUp marking us as failing
    // and re-register, which rotates the secret.
    console.warn('[clickup-webhook] signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // From here on, ALWAYS return 200. Internal errors (Firestore blip, ClickUp
  // GET timeout, malformed payload) are logged but never bubble up — five
  // consecutive 5xx responses cause ClickUp to permanently auto-disable the
  // webhook, and any blip would be enough to break sync until manual re-register.
  try {
    return await handleVerifiedEvent(rawBody);
  } catch (err) {
    console.error('[clickup-webhook] handler error (acked to avoid auto-disable)', err);
    return NextResponse.json({ ok: true, ignored: 'internal-error' });
  }
}

async function handleVerifiedEvent(rawBody: string): Promise<NextResponse> {
  let payload: ClickUpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ClickUpWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid-json' });
  }

  const { event, task_id: taskId } = payload;
  if (!event) {
    return NextResponse.json({ ok: true, ignored: 'no-event' });
  }
  if (!taskId || !event.startsWith('task')) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Local task already linked? Look it up first; that determines whether this
  // is an update vs a candidate-for-create.
  const matches = await adminDb
    .collection(TASKS_COLLECTION)
    .where('clickupTaskId', '==', taskId)
    .get();
  const localMirrors = matches.docs.map(localClickUpTaskDocFromSnapshot);
  const existing = chooseCanonicalClickUpDoc(localMirrors);

  // taskDeleted is the easy case — no need to refetch.
  if (event === 'taskDeleted') {
    if (!existing) {
      return NextResponse.json({ ok: true, ignored: 'unlinked-and-deleted' });
    }
    const cleaned = await cleanupLocalClickUpMirrors(localMirrors, null, Timestamp.now());
    return NextResponse.json({ ok: true, action: 'removed-on-delete', cleaned });
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
        const cleaned = await cleanupLocalClickUpMirrors(localMirrors, null, Timestamp.now());
        return NextResponse.json({ ok: true, action: 'removed-on-404', cleaned });
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
    const localData = existing.data;
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
      const cleaned = await cleanupLocalClickUpMirrors(localMirrors, null, Timestamp.now());
      return NextResponse.json({ ok: true, action: 'removed-list-moved-out', cleaned });
    }

    const deduped = await cleanupLocalClickUpMirrors(localMirrors, existing.id, Timestamp.now());
    const pendingLocalRequest =
      localData.clickupSyncRequestId &&
      localData.clickupLastSyncedRequestId !== localData.clickupSyncRequestId;
    if (projectId && pendingLocalRequest) {
      await syncTaskUpdateToClickUp(projectId, existing.id, {
        expectedRequestId: localData.clickupSyncRequestId,
        forceFullState: true,
      });
      return NextResponse.json({ ok: true, action: 'deferred-local-pending', event });
    }

    await existing.ref.update({
      ...patch,
      ...completedAtUpdate,
      clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
      clickupSyncedAt: Timestamp.now(),
      clickupLastSyncedRequestId: localData.clickupSyncRequestId ?? null,
      clickupSyncError: FieldValue.delete(),
      clickupSyncFailedAt: FieldValue.delete(),
      clickupSyncInFlightAt: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
    return NextResponse.json({ ok: true, action: 'synced', event, deduped });
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
    parentClickupTaskId: patch.parentClickupTaskId,
    clickupUrl: task.url ?? buildClickUpTaskUrl(taskId),
    clickupSyncedAt: now,
    clickupLastSyncedRequestId: null,
    order: Date.now(),
    completedAt: patch.status === 'done' ? now : null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'clickup-sync@system',
  });

  return NextResponse.json({ ok: true, action: 'created', projectId });
}
