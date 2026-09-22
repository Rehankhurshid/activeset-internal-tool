import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';

/**
 * A job queue for the machine in the corner.
 *
 * The work this feeds — a vision model, a headless browser at three
 * viewports, re-encoding a few hundred images — is the wrong shape for a
 * serverless function and the right shape for a PC that is already on. The
 * awkward part is reaching it: it sits behind a router with no public
 * address, so nothing can call *in*.
 *
 * So it calls out. The worker polls this collection, claims a job in a
 * transaction, heartbeats while it runs and writes the result back. No
 * inbound ports, no tunnel, no dynamic DNS, and if the PC is off the jobs
 * simply wait. The same shape the scan jobs already use.
 */

const WORKER_JOBS = 'worker_jobs';

/** A claim older than this is assumed dead and may be taken by another worker. */
export const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export type WorkerJobKind =
  | 'alt_text'
  | 'image_budget'
  | 'alt_apply'
  | 'webflow_alt'
  | 'image_apply';
export type WorkerJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface WorkerJob<P = Record<string, unknown>> {
  id: string;
  kind: WorkerJobKind;
  projectId: string;
  projectName?: string;
  payload: P;
  status: WorkerJobStatus;
  /** Free text the worker updates so the app can show what is happening. */
  progress?: string;
  /** 0–1, when the worker can say. */
  fraction?: number;
  claimedBy?: string;
  claimedAt?: string;
  heartbeatAt?: string;
  finishedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
  requestedBy?: string;
  createdAt: string;
  attempts: number;
}

export class WorkerQueueUnavailableError extends Error {
  constructor() {
    super('No Firebase admin credentials. Run: npx vercel env pull .env.local');
    this.name = 'WorkerQueueUnavailableError';
  }
}

function collection() {
  if (!hasFirebaseAdminCredentials) throw new WorkerQueueUnavailableError();
  return adminDb.collection(WORKER_JOBS);
}

const nowIso = () => new Date().toISOString();

export async function enqueueJob(input: {
  kind: WorkerJobKind;
  projectId: string;
  projectName?: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
}): Promise<WorkerJob> {
  const ref = collection().doc();
  const job: WorkerJob = {
    id: ref.id,
    kind: input.kind,
    projectId: input.projectId,
    projectName: input.projectName,
    payload: input.payload ?? {},
    status: 'queued',
    createdAt: nowIso(),
    attempts: 0,
    requestedBy: input.requestedBy,
  };
  const { id: _id, ...data } = job;
  void _id;
  await ref.set(
    Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
  );
  return job;
}

/**
 * Take the oldest waiting job, or reclaim one whose worker went away.
 *
 * The read and the write are in one transaction so two workers — or the same
 * worker restarted — cannot both decide they own the same job.
 */
export async function claimNextJob(
  workerId: string,
  kinds?: WorkerJobKind[],
): Promise<WorkerJob | null> {
  const base = collection();
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();

  // Two cheap reads rather than one composite index: waiting work first, then
  // anything abandoned.
  const queued = await base.where('status', '==', 'queued').limit(10).get();
  const running = await base.where('status', '==', 'running').limit(10).get();

  const candidates = [...queued.docs, ...running.docs]
    .map((doc) => ({ ...(doc.data() as Omit<WorkerJob, 'id'>), id: doc.id }))
    .filter((job) => (kinds ? kinds.includes(job.kind) : true))
    .filter((job) => job.status === 'queued' || (job.heartbeatAt ?? job.claimedAt ?? '') < staleBefore)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const candidate of candidates) {
    const ref = base.doc(candidate.id);
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const job = { ...(snapshot.data() as Omit<WorkerJob, 'id'>), id: ref.id };

      const isFree =
        job.status === 'queued' ||
        (job.status === 'running' && (job.heartbeatAt ?? job.claimedAt ?? '') < staleBefore);
      if (!isFree) return null;

      const update = {
        status: 'running' as const,
        claimedBy: workerId,
        claimedAt: nowIso(),
        heartbeatAt: nowIso(),
        attempts: (job.attempts ?? 0) + 1,
        error: FieldValue.delete(),
      };
      transaction.update(ref, update);
      return { ...job, ...update, error: undefined } as WorkerJob;
    });

    if (claimed) return claimed;
  }

  return null;
}

export async function heartbeat(jobId: string, progress?: string, fraction?: number): Promise<void> {
  await collection()
    .doc(jobId)
    .update(
      Object.fromEntries(
        Object.entries({ heartbeatAt: nowIso(), progress, fraction }).filter(([, v]) => v !== undefined),
      ),
    );
}

export async function completeJob(
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await collection().doc(jobId).update({
    status: 'done',
    result,
    progress: FieldValue.delete(),
    fraction: 1,
    finishedAt: nowIso(),
    heartbeatAt: nowIso(),
  });
}

export async function failJob(jobId: string, error: string): Promise<void> {
  await collection().doc(jobId).update({
    status: 'failed',
    error: error.slice(0, 2000),
    finishedAt: nowIso(),
    heartbeatAt: nowIso(),
  });
}

/**
 * The worker announces itself so the app can say "the PC last checked in two
 * minutes ago" rather than leaving someone wondering why nothing happens.
 */
export async function reportWorkerAlive(workerId: string, details: Record<string, unknown>): Promise<void> {
  if (!hasFirebaseAdminCredentials) throw new WorkerQueueUnavailableError();
  await adminDb
    .collection('workers')
    .doc(workerId)
    .set({ ...details, workerId, lastSeenAt: nowIso(), updatedAt: AdminTimestamp.now() }, { merge: true });
}
