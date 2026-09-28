import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import type { MeetingShareStatus, ProjectMeeting } from '@/types';

export const runtime = 'nodejs';

const STATUSES: MeetingShareStatus[] = ['pending', 'shared', 'hidden'];
const MAX_SUMMARY = 20_000;

/**
 * PATCH /api/client-portal/[projectId]/meetings/[meetingId] — the team's
 * decisions on one call: share it with the client or hide it
 * (`status`), file it under another stage (`phaseId`), or rewrite what the
 * client reads (`clientSummary`, `null` to go back to Fathom's).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; meetingId: string }> },
) {
  const { projectId, meetingId } = await params;
  let caller;
  try {
    caller = await requireProjectAccess(req, projectId);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    status?: unknown;
    phaseId?: unknown;
    clientSummary?: unknown;
  };
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as MeetingShareStatus)) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    }
    patch.status = body.status;
    patch.decidedAt = new Date().toISOString();
    patch.decidedBy = caller.email;
  }
  if (body.phaseId !== undefined) {
    if (typeof body.phaseId !== 'string' || !body.phaseId || body.phaseId.length > 120) {
      return NextResponse.json({ error: 'Bad stage' }, { status: 400 });
    }
    patch.phaseId = body.phaseId;
    patch.phaseSetBy = 'team';
  }
  if (body.clientSummary !== undefined) {
    if (body.clientSummary !== null && typeof body.clientSummary !== 'string') {
      return NextResponse.json({ error: 'Bad summary' }, { status: 400 });
    }
    const text = typeof body.clientSummary === 'string' ? body.clientSummary.trim().slice(0, MAX_SUMMARY) : '';
    patch.clientSummary = text || null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  const ref = db
    .collection(COLLECTIONS.PROJECTS)
    .doc(projectId)
    .collection(COLLECTIONS.PROJECT_MEETINGS)
    .doc(meetingId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'No such call' }, { status: 404 });
  await ref.update(patch);
  return NextResponse.json({ meeting: { ...(snap.data() as ProjectMeeting), ...patch, id: meetingId } });
}
