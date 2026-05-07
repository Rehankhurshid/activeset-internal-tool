import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireCaller,
} from '@/lib/api-auth';
import { ClickUpError, fetchTeamMembers, listTeams } from '@/lib/clickup';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 15;

async function loadClickUpTeamId(): Promise<string | null> {
  if (!hasFirebaseAdminCredentials) return null;
  try {
    const snap = await adminDb
      .collection(COLLECTIONS.APP_SECRETS)
      .doc('clickup')
      .get();
    if (!snap.exists) return null;
    const data = snap.data() as { teamId?: string } | undefined;
    return data?.teamId ?? null;
  } catch (err) {
    console.warn('[clickup-members] could not read app_secrets/clickup', err);
    return null;
  }
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

/**
 * GET — list ClickUp workspace members so the task assignee dropdown can be
 * populated from the workspace instead of the access-control doc. Returns one
 * entry per member with an email; members without an email are skipped (the
 * dropdown is keyed on email).
 */
export async function GET(request: NextRequest) {
  try {
    await requireCaller(request);
    const teamId = await resolveTeamId();
    const members = await fetchTeamMembers(teamId);
    const emails = Array.from(
      new Set(
        members
          .map((m) => m.email?.toLowerCase().trim())
          .filter((e): e is string => Boolean(e)),
      ),
    ).sort();
    return NextResponse.json({ teamId, emails });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof ClickUpError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status ?? 500 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
