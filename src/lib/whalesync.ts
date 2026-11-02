import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import {
  fromWhalesync,
  type ContentSync,
  type WhalesyncIssue,
  type WhalesyncSync,
} from '@/modules/client-portal/domain/content-syncs';

/**
 * Whalesync's public API, read-only, for the content syncs on the client's
 * page. `GET /v1/sync/syncs/{id}` gives status, `open_issues` and
 * `last_synced_at`; `GET /v1/sync/issues?sync=…` the issues behind the count.
 * A key with the `read` scope is enough (Whalesync → Settings → API keys).
 *
 * Without `WHALESYNC_API_KEY` nothing here runs and every sync stays manual.
 */

const API = 'https://api.whalesync.com/v1';
const KEY_ENV = 'WHALESYNC_API_KEY';
/** Issues kept per sync for the team; the count comes from the sync itself. */
const ISSUES_KEPT = 10;

export const whalesyncConfigured = () => !!process.env[KEY_ENV];

export class WhalesyncUnavailableError extends Error {
  constructor() {
    super('Whalesync is not connected: add WHALESYNC_API_KEY (Whalesync → Settings → API keys, read scope).');
    this.name = 'WhalesyncUnavailableError';
  }
}

export class WhalesyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'WhalesyncApiError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call<T>(path: string): Promise<T> {
  const key = process.env[KEY_ENV];
  if (!key) throw new WhalesyncUnavailableError();
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${key}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 429) break;
    const wait = Number(res.headers.get('retry-after'));
    await sleep(Math.min(20_000, Number.isFinite(wait) && wait > 0 ? wait * 1000 : 2_000 * (attempt + 1)));
  }
  if (!res) throw new WhalesyncApiError('Whalesync did not answer', 502);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const why =
      res.status === 401
        ? 'the API key was refused'
        : res.status === 404
          ? 'no such sync on this Whalesync account'
          : body?.error?.message || body?.error?.code || `HTTP ${res.status}`;
    throw new WhalesyncApiError(`Whalesync: ${why}`, res.status);
  }
  return (await res.json()) as T;
}

export function getWhalesyncSync(id: string): Promise<WhalesyncSync> {
  return call<WhalesyncSync>(`/sync/syncs/${encodeURIComponent(id)}`);
}

export async function listWhalesyncIssues(id: string): Promise<WhalesyncIssue[]> {
  const body = await call<{ data?: WhalesyncIssue[] }>(
    `/sync/issues?${new URLSearchParams({ sync: id, limit: String(ISSUES_KEPT) })}`,
  );
  return Array.isArray(body.data) ? body.data : [];
}

/** Every sync on the key's account, for the team's "link to Whalesync" picker. */
export async function listWhalesyncSyncs(): Promise<WhalesyncSync[]> {
  const out: WhalesyncSync[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const body: { data?: WhalesyncSync[]; has_more?: boolean; next_cursor?: string | null } = await call(
      `/sync/syncs?${params}`,
    );
    out.push(...(body.data ?? []));
    cursor = body.has_more ? (body.next_cursor ?? null) : null;
    if (!cursor) break;
  }
  return out;
}

function syncsRef(projectId: string) {
  return adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(COLLECTIONS.PROJECT_CONTENT_SYNCS);
}

/**
 * Reads one linked row from Whalesync and writes what it found. A failure is
 * recorded on the row (`refreshError`) and the last known status stays, so
 * the client's chip never empties because Whalesync had a bad minute.
 */
export async function refreshContentSync(
  projectId: string,
  row: Pick<ContentSync, 'id' | 'whalesyncId' | 'source' | 'destination' | 'provider'>,
): Promise<{ ok: boolean; error?: string }> {
  if (!row.whalesyncId) return { ok: false, error: 'Not linked to Whalesync' };
  const ref = syncsRef(projectId).doc(row.id);
  try {
    const sync = await getWhalesyncSync(row.whalesyncId);
    const issues = sync.open_issues ? await listWhalesyncIssues(row.whalesyncId).catch(() => []) : [];
    const patch = fromWhalesync(sync, issues, row);
    await ref.update({ ...patch, refreshError: FieldValue.delete() });
    return { ok: true };
  } catch (error) {
    if (error instanceof WhalesyncUnavailableError) throw error;
    const message = error instanceof Error ? error.message : 'Whalesync read failed';
    await ref.update({ refreshError: message.slice(0, 300), refreshedAt: new Date().toISOString() }).catch(() => {});
    return { ok: false, error: message };
  }
}

/** Every linked row of one project. */
export async function refreshProjectContentSyncs(projectId: string): Promise<{ refreshed: number; failed: number }> {
  if (!whalesyncConfigured()) throw new WhalesyncUnavailableError();
  const snap = await syncsRef(projectId).limit(50).get();
  let refreshed = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const row = { ...(doc.data() as ContentSync), id: doc.id };
    if (!row.whalesyncId) continue;
    const result = await refreshContentSync(projectId, row);
    if (result.ok) refreshed += 1;
    else failed += 1;
  }
  return { refreshed, failed };
}

/**
 * Every linked row in every project, for the hourly cron. One collection-group
 * read (no filter, so no extra index), then one Whalesync call per linked row.
 */
export async function refreshAllContentSyncs(): Promise<{ refreshed: number; failed: number; linked: number }> {
  if (!whalesyncConfigured()) throw new WhalesyncUnavailableError();
  const snap = await adminDb.collectionGroup(COLLECTIONS.PROJECT_CONTENT_SYNCS).limit(1000).get();
  let refreshed = 0;
  let failed = 0;
  let linked = 0;
  for (const doc of snap.docs) {
    const projectId = doc.ref.parent.parent?.id;
    const row = { ...(doc.data() as ContentSync), id: doc.id };
    if (!projectId || !row.whalesyncId) continue;
    linked += 1;
    const result = await refreshContentSync(projectId, row);
    if (result.ok) refreshed += 1;
    else failed += 1;
  }
  return { refreshed, failed, linked };
}
