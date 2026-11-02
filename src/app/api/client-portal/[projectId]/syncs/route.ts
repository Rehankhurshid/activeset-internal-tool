import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import {
  WhalesyncUnavailableError,
  listWhalesyncSyncs,
  refreshContentSync,
  refreshProjectContentSyncs,
  whalesyncConfigured,
} from '@/lib/whalesync';
import {
  MAX_CONTENT_SYNCS,
  cleanContentSyncInput,
  sortContentSyncs,
  whalesyncSideLabel,
  type ContentSync,
} from '@/modules/client-portal/domain/content-syncs';

export const runtime = 'nodejs';
export const maxDuration = 60;

function syncsRef(projectId: string) {
  return db.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(COLLECTIONS.PROJECT_CONTENT_SYNCS);
}

async function listRows(projectId: string): Promise<ContentSync[]> {
  const snap = await syncsRef(projectId).limit(MAX_CONTENT_SYNCS * 2).get();
  return sortContentSyncs(snap.docs.map((doc) => ({ ...(doc.data() as ContentSync), id: doc.id })));
}

/**
 * GET /api/client-portal/[projectId]/syncs — the project's content syncs,
 * team fields included, and whether Whalesync is connected on this
 * deployment. `?available=1` also lists the Whalesync account's syncs, for
 * linking a row to one. The collection is deny-by-default for browsers.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProjectAccess(req, projectId);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });

  const connected = whalesyncConfigured();
  const syncs = await listRows(projectId);
  if (!connected || req.nextUrl.searchParams.get('available') !== '1') {
    return NextResponse.json({ syncs, connected });
  }
  try {
    const available = (await listWhalesyncSyncs()).map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
      status: s.status ?? null,
      source: whalesyncSideLabel(s.left) ?? null,
      destination: whalesyncSideLabel(s.right) ?? null,
    }));
    return NextResponse.json({ syncs, connected, available });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not list Whalesync syncs';
    return NextResponse.json({ syncs, connected, available: [], availableError: message });
  }
}

/**
 * POST /api/client-portal/[projectId]/syncs
 * - `{ action: 'create', sync: {...} }`: add a sync (name required). Linked to
 *   Whalesync and with a key set, it is read from Whalesync straight away.
 * - `{ action: 'refresh' }`: read every linked row from Whalesync now. 503
 *   without `WHALESYNC_API_KEY`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  let caller;
  try {
    caller = await requireProjectAccess(req, projectId);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; sync?: unknown };

  if (body.action === 'refresh') {
    try {
      const result = await refreshProjectContentSyncs(projectId);
      return NextResponse.json({ ...result, syncs: await listRows(projectId) });
    } catch (error) {
      if (error instanceof WhalesyncUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
      console.error('[client-portal/syncs] refresh failed:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Refresh failed' }, { status: 502 });
    }
  }

  if (body.action !== 'create') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const cleaned = cleanContentSyncInput(body.sync);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const input = cleaned.input;
  if (!input.name) return NextResponse.json({ error: 'Give the sync a name' }, { status: 400 });

  const existing = await listRows(projectId);
  if (existing.length >= MAX_CONTENT_SYNCS) {
    return NextResponse.json({ error: `A project can list up to ${MAX_CONTENT_SYNCS} syncs` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row: Omit<ContentSync, 'id'> = {
    name: input.name,
    state: input.state ?? 'active',
    openIssues: input.openIssues ?? 0,
    showToClient: input.showToClient ?? true,
    order: existing.reduce((max, s) => Math.max(max, s.order ?? 0), -1) + 1,
    createdAt: now,
    createdBy: caller.email,
    updatedAt: now,
    updatedBy: caller.email,
  };
  for (const key of ['provider', 'source', 'destination', 'lastRunAt', 'notes', 'clientNote', 'whalesyncId'] as const) {
    const value = input[key];
    if (value) row[key] = value;
  }
  if (row.whalesyncId && !row.provider) row.provider = 'Whalesync';

  const ref = await syncsRef(projectId).add(row);
  let refreshError: string | undefined;
  if (row.whalesyncId && whalesyncConfigured()) {
    try {
      const result = await refreshContentSync(projectId, { ...row, id: ref.id });
      refreshError = result.error;
    } catch (error) {
      refreshError = error instanceof Error ? error.message : 'Refresh failed';
    }
  }
  const saved = await ref.get();
  return NextResponse.json({ sync: { ...(saved.data() as ContentSync), id: ref.id }, refreshError });
}
