import { addDoc, collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import type { WeightAssessment } from '../domain/image-budget';

/**
 * The app's side of the worker.
 *
 * Queueing is an ordinary authenticated write — the rules let the team create
 * a job and nobody else — so no API route stands in the middle. The worker
 * polls, claims and writes back with the admin SDK; the browser only ever
 * queues and watches.
 */

const WORKER_JOBS = 'worker_jobs';
const WORKERS = 'workers';
const IMAGE_BUDGET = 'image_budget';

export type WorkerJobKind = 'alt_text' | 'image_budget';
export type WorkerJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface WorkerJobDoc {
  id: string;
  kind: WorkerJobKind;
  projectId: string;
  projectName?: string;
  status: WorkerJobStatus;
  progress?: string;
  fraction?: number;
  claimedBy?: string;
  heartbeatAt?: string;
  finishedAt?: string;
  createdAt: string;
  result?: Record<string, unknown>;
  error?: string;
  requestedBy?: string;
}

export interface WorkerDoc {
  workerId: string;
  platform?: string;
  cpu?: string;
  ramGb?: number;
  gpu?: string;
  vramGb?: number;
  model?: string;
  lastSeenAt: string;
}

export interface WeightFindingDoc extends WeightAssessment {
  id: string;
  fingerprint: string;
  pages: string[];
  widestAt?: number;
  isBackground?: boolean;
  hasSrcset?: boolean;
  optimisedBytes?: number;
  optimisedPath?: string;
  format: string;
  measuredAt: string;
}

export interface WorkerRepository {
  enqueue: (input: {
    kind: WorkerJobKind;
    projectId: string;
    projectName?: string;
    payload?: Record<string, unknown>;
    requestedBy?: string;
  }) => Promise<string>;
  subscribeJobs: (projectId: string, onChange: (jobs: WorkerJobDoc[]) => void) => () => void;
  subscribeWorkers: (onChange: (workers: WorkerDoc[]) => void) => () => void;
  subscribeWeight: (projectId: string, onChange: (findings: WeightFindingDoc[]) => void) => () => void;
}

export const workerRepository: WorkerRepository = {
  async enqueue(input) {
    const ref = await addDoc(collection(db, WORKER_JOBS), {
      kind: input.kind,
      projectId: input.projectId,
      ...(input.projectName ? { projectName: input.projectName } : {}),
      payload: input.payload ?? {},
      status: 'queued',
      createdAt: new Date().toISOString(),
      attempts: 0,
      ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
    });
    return ref.id;
  },

  subscribeJobs(projectId, onChange) {
    // Equality plus a bounded in-memory sort, so no composite index is needed.
    return onSnapshot(
      query(collection(db, WORKER_JOBS), where('projectId', '==', projectId), limit(40)),
      (snap) => {
        const jobs = snap.docs
          .map((doc) => ({ ...(doc.data() as Omit<WorkerJobDoc, 'id'>), id: doc.id }))
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        onChange(jobs);
      },
      (error) => {
        console.error('[worker] job subscription failed:', error);
        onChange([]);
      },
    );
  },

  subscribeWorkers(onChange) {
    return onSnapshot(
      query(collection(db, WORKERS), orderBy('lastSeenAt', 'desc'), limit(10)),
      (snap) => onChange(snap.docs.map((doc) => ({ ...(doc.data() as WorkerDoc), workerId: doc.id }))),
      (error) => {
        console.error('[worker] roster subscription failed:', error);
        onChange([]);
      },
    );
  },

  subscribeWeight(projectId, onChange) {
    return onSnapshot(
      collection(db, COLLECTIONS.PROJECTS, projectId, IMAGE_BUDGET),
      (snap) => {
        const findings = snap.docs
          .map((doc) => ({ ...(doc.data() as Omit<WeightFindingDoc, 'id'>), id: doc.id }))
          .sort((a, b) => (b.estimatedSaving ?? 0) - (a.estimatedSaving ?? 0));
        onChange(findings);
      },
      (error) => {
        console.error('[worker] weight subscription failed:', error);
        onChange([]);
      },
    );
  },
};

/** A worker that has not checked in for this long is treated as offline. */
export const WORKER_OFFLINE_AFTER_MS = 90 * 1000;

export function isWorkerOnline(worker: WorkerDoc, now = Date.now()): boolean {
  const seen = new Date(worker.lastSeenAt).getTime();
  return Number.isFinite(seen) && now - seen < WORKER_OFFLINE_AFTER_MS;
}
