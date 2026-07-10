import 'server-only';

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type UpdateData,
} from 'firebase-admin/firestore';

interface LocalClickUpTaskData {
  projectId?: string;
  clickupTaskId?: string;
  clickupSyncRequestId?: string;
  clickupLastSyncedRequestId?: string | null;
  clickupSyncError?: string;
  clickupSyncedAt?: unknown;
  source?: string;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LocalClickUpTaskDoc {
  id: string;
  ref: QueryDocumentSnapshot['ref'];
  data: LocalClickUpTaskData;
  syncedAtMs: number;
  updatedAtMs: number;
  createdAtMs: number;
}

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object') {
    const maybeTimestamp = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof maybeTimestamp.toMillis === 'function') {
      const ms = maybeTimestamp.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof maybeTimestamp.toDate === 'function') {
      const date = maybeTimestamp.toDate();
      return date instanceof Date ? date.getTime() : 0;
    }
  }
  return 0;
}

export function localClickUpTaskDocFromSnapshot(
  doc: QueryDocumentSnapshot,
): LocalClickUpTaskDoc {
  const data = doc.data() as LocalClickUpTaskData;
  return {
    id: doc.id,
    ref: doc.ref,
    data,
    syncedAtMs: timestampMs(data.clickupSyncedAt),
    updatedAtMs: timestampMs(data.updatedAt),
    createdAtMs: timestampMs(data.createdAt),
  };
}

function isBetterCanonical(
  candidate: LocalClickUpTaskDoc,
  current: LocalClickUpTaskDoc,
): boolean {
  const candidateHealthy = candidate.data.clickupSyncError ? 0 : 1;
  const currentHealthy = current.data.clickupSyncError ? 0 : 1;
  if (candidateHealthy !== currentHealthy) return candidateHealthy > currentHealthy;
  if (candidate.syncedAtMs !== current.syncedAtMs) {
    return candidate.syncedAtMs > current.syncedAtMs;
  }
  if (candidate.updatedAtMs !== current.updatedAtMs) {
    return candidate.updatedAtMs > current.updatedAtMs;
  }
  return candidate.createdAtMs > current.createdAtMs;
}

export function chooseCanonicalClickUpDoc<T extends LocalClickUpTaskDoc>(
  docs: T[],
): T | null {
  if (docs.length === 0) return null;
  return docs.reduce((best, doc) => (isBetterCanonical(doc, best) ? doc : best));
}

export function isDisposableClickUpMirror(doc: LocalClickUpTaskDoc): boolean {
  return doc.data.source === 'clickup' || doc.data.createdBy === 'clickup-sync@system';
}

export function buildClickUpUnlinkPatch(now: Timestamp): UpdateData<DocumentData> {
  return {
    clickupTaskId: null,
    clickupUrl: null,
    clickupSyncedAt: null,
    clickupLastSyncedRequestId: null,
    clickupSyncError: FieldValue.delete(),
    clickupSyncFailedAt: FieldValue.delete(),
    clickupSyncInFlightAt: FieldValue.delete(),
    source: 'manual',
    updatedAt: now,
  };
}
