import { addDoc, collection, doc as docRef, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS } from '@/lib/constants';
import type { WeightAssessment } from '../domain/image-budget';
import {
  validateDesired,
  type WorkerAction,
  type WorkerCommand,
  type WorkerDesiredState,
} from '../domain/worker-control';

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

export type WorkerJobKind =
  | 'alt_text'
  | 'image_budget'
  | 'alt_apply'
  | 'webflow_alt'
  | 'image_apply'
  | 'library_optimise';
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
  paused?: boolean;
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
  /** Which encoding won — or why the image was left untouched. */
  optimisedHow?: string;
  /** cms = repointable from the app; asset/unknown = a swap in Designer. */
  placement?: 'cms' | 'asset' | 'unknown';
  /** An optimised copy already in the client's Webflow library, for a swap in Designer. */
  replacement?: { url: string; assetId: string; name: string; bytes: number; width: number | null };
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
  subscribeControl: (
    workerId: string,
    onChange: (state: { desired: WorkerDesiredState; commands: WorkerCommand[] }) => void,
  ) => () => void;
  setDesired: (workerId: string, desired: Partial<WorkerDesiredState>, by: string) => Promise<void>;
  sendCommand: (workerId: string, action: WorkerAction, by: string) => Promise<string>;
}

/**
 * Control lives in a subcollection, never on the worker document.
 *
 * The worker document is the machine's own report — hardware, model, what it
 * is doing — and the team must not be able to rewrite it, or the app would be
 * showing them their own wishes back as fact. So the heartbeat stays
 * admin-only and everything the team can change sits underneath it.
 */
const controlRepository: Pick<WorkerRepository, 'subscribeControl' | 'setDesired' | 'sendCommand'> = {
  subscribeControl(workerId, onChange) {
    let desired: WorkerDesiredState = {};
    let commands: WorkerCommand[] = [];
    const emit = () => onChange({ desired, commands });

    const stopDesired = onSnapshot(
      docRef(db, WORKERS, workerId, 'control', 'desired'),
      (snap) => {
        desired = (snap.data() as WorkerDesiredState) ?? {};
        emit();
      },
      () => emit(),
    );

    const stopCommands = onSnapshot(
      query(collection(db, WORKERS, workerId, 'commands'), limit(20)),
      (snap) => {
        commands = snap.docs
          .map((entry) => ({ ...(entry.data() as Omit<WorkerCommand, 'id'>), id: entry.id }))
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        emit();
      },
      () => emit(),
    );

    return () => {
      stopDesired();
      stopCommands();
    };
  },

  async setDesired(workerId, desired, by) {
    // Checked here so a refusal can be explained, and again on the worker
    // because the app is not the only thing that can write to Firestore.
    const { ok, reason, value } = validateDesired(desired);
    if (!ok) throw new Error(reason);
    await setDoc(
      docRef(db, WORKERS, workerId, 'control', 'desired'),
      { ...value, by, at: new Date().toISOString() },
      { merge: true },
    );
  },

  async sendCommand(workerId, action, by) {
    const created = await addDoc(collection(db, WORKERS, workerId, 'commands'), {
      action,
      status: 'pending',
      requestedBy: by,
      createdAt: new Date().toISOString(),
    });
    return created.id;
  },
};

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

  ...controlRepository,
};

/** A worker that has not checked in for this long is treated as offline. */
export const WORKER_OFFLINE_AFTER_MS = 90 * 1000;

export function isWorkerOnline(worker: WorkerDoc, now = Date.now()): boolean {
  const seen = new Date(worker.lastSeenAt).getTime();
  return Number.isFinite(seen) && now - seen < WORKER_OFFLINE_AFTER_MS;
}
