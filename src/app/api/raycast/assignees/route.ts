import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/constants';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { requireRaycastCaller } from '@/lib/raycast-auth';
import { ClickUpError, fetchTeamMembers, listTeams } from '@/lib/clickup';

export const runtime = 'nodejs';
export const maxDuration = 15;

async function loadClickUpTeamId(): Promise<string | null> {
  if (!hasFirebaseAdminCredentials) return null;
  const snap = await adminDb.collection(COLLECTIONS.APP_SECRETS).doc('clickup').get();
  if (!snap.exists) return null;
  return (snap.data() as { teamId?: string } | undefined)?.teamId ?? null;
}

async function resolveTeamId(): Promise<string> {
  const stored = await loadClickUpTeamId();
  if (stored) return stored;
  const envTeamId = process.env.CLICKUP_TEAM_ID?.trim();
  if (envTeamId) return envTeamId;
  const teams = await listTeams();
  if (teams.length === 0) {
    throw new ClickUpError('No ClickUp workspaces found for the configured token', 404);
  }
  return teams[0].id;
}

export async function GET(request: NextRequest) {
  try {
    await requireRaycastCaller(request);
    const teamId = await resolveTeamId();
    const members = await fetchTeamMembers(teamId);
    const emails = Array.from(
      new Set(
        members
          .map((member) => member.email?.toLowerCase().trim())
          .filter((email): email is string => Boolean(email)),
      ),
    ).sort();
    return NextResponse.json({ ok: true, teamId, emails });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    if (error instanceof ClickUpError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status ?? 500 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
