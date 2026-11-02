import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { refreshContentSync, whalesyncConfigured } from '@/lib/whalesync';
import { cleanContentSyncInput, type ContentSync } from '@/modules/client-portal/domain/content-syncs';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Params = { params: Promise<{ projectId: string; syncId: string }> };

async function authorise(req: NextRequest, projectId: string) {
  try {
    return { caller: await requireProjectAccess(req, projectId), denied: null };
  } catch (err) {
    if (err instanceof ApiAuthError) return { caller: null, denied: apiAuthErrorResponse(err) };
    throw err;
  }
}

function rowRef(projectId: string, syncId: string) {
  return db
    .collection(COLLECTIONS.PROJECTS)
    .doc(projectId)
    .collection(COLLECTIONS.PROJECT_CONTENT_SYNCS)
    .doc(syncId);
}

/**
 * PATCH /api/client-portal/[projectId]/syncs/[syncId] — edit a sync: any of
 * name, provider, source, destination, state, lastRunAt, openIssues, notes,
 * clientNote, showToClient, whalesyncId. An empty string or `null` clears an
 * optional field. Linking (or re-linking) a row to Whalesync reads it straight
 * away when the key is set. Unlinking drops what Whalesync last said.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { projectId, syncId } = await params;
  const { caller, denied } = await authorise(req, projectId);
  if (denied) return denied;
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });

  const cleaned = cleanContentSyncInput(await req.json().catch(() => null));
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const input = cleaned.input;
  if (Object.keys(input).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  const ref = rowRef(projectId, syncId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'No such sync' }, { status: 404 });
  const before = snap.data() as ContentSync;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: caller!.email };
  for (const [key, value] of Object.entries(input)) {
    patch[key] = value === null ? FieldValue.delete() : value;
  }
  if (input.whalesyncId === null) {
    for (const key of ['issues', 'authErrors', 'refreshedAt', 'refreshError']) patch[key] = FieldValue.delete();
  }
  await ref.update(patch);

  const relinked = !!input.whalesyncId && input.whalesyncId !== before.whalesyncId;
  let refreshError: string | undefined;
  if (relinked && whalesyncConfigured()) {
    const after = (await ref.get()).data() as ContentSync;
    try {
      refreshError = (await refreshContentSync(projectId, { ...after, id: syncId })).error;
    } catch (error) {
      refreshError = error instanceof Error ? error.message : 'Refresh failed';
    }
  }
  const saved = await ref.get();
  return NextResponse.json({ sync: { ...(saved.data() as ContentSync), id: syncId }, refreshError });
}

/** DELETE — take the sync off the project (and the client's page). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { projectId, syncId } = await params;
  const { denied } = await authorise(req, projectId);
  if (denied) return denied;
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  await rowRef(projectId, syncId).delete();
  return NextResponse.json({ ok: true });
}
