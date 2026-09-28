import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import { FathomUnavailableError, fathomConfigured, syncFathomMeetings } from '@/lib/fathom';
import { meetingDomainsFor } from '@/modules/client-portal/domain/client-timeline';
import type { Project, ProjectMeeting } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** How far back "Check Fathom now" looks for a project's calls. */
const BACKFILL_DAYS = 180;

async function authorise(req: NextRequest, projectId: string) {
  try {
    await requireProjectAccess(req, projectId);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    throw err;
  }
  if (!hasFirebaseAdminCredentials) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  return null;
}

/**
 * GET /api/client-portal/[projectId]/meetings — every call filed under the
 * project, whatever its status, for the Client tab. The collection is
 * deny-by-default for browsers, so this route is the team's only way in.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const denied = await authorise(req, projectId);
  if (denied) return denied;

  const [meetingSnap, projectSnap] = await Promise.all([
    db.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(COLLECTIONS.PROJECT_MEETINGS).limit(300).get(),
    db.collection(COLLECTIONS.PROJECTS).doc(projectId).get(),
  ]);
  const meetings = meetingSnap.docs
    .map((doc) => ({ ...(doc.data() as ProjectMeeting), id: doc.id }))
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const project = projectSnap.exists ? ({ ...(projectSnap.data() as Project), id: projectId }) : null;

  return NextResponse.json({
    meetings,
    connected: fathomConfigured(),
    domains: project ? meetingDomainsFor(project) : [],
  });
}

/**
 * POST /api/client-portal/[projectId]/meetings `{ action: 'sync' }` — look
 * through the last six months of Fathom for this project's calls now, rather
 * than waiting for the hourly sync. New calls arrive pending.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const denied = await authorise(req, projectId);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'sync') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  try {
    const createdAfter = new Date(Date.now() - BACKFILL_DAYS * 86_400_000).toISOString();
    const result = await syncFathomMeetings({ createdAfter, projectIds: [projectId] });
    return NextResponse.json({ added: result.added, seen: result.seen, filed: Object.values(result.filed)[0] ?? 0 });
  } catch (error) {
    if (error instanceof FathomUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('[client-portal/meetings] sync failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Sync failed' }, { status: 502 });
  }
}
