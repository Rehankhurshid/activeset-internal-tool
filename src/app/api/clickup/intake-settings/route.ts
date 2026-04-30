import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireProjectAccess,
} from '@/lib/api-auth';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { generateIntakeToken } from '@/lib/intake-token';
import { COLLECTIONS } from '@/lib/constants';
import type { Project } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;

interface SettingsBody {
  projectId?: string;
  enabled?: boolean;
  autoCreate?: boolean;
  rotate?: boolean;
  welcomeMessage?: string | null;
}

/** GET — return current intake settings + the public URL (if any). */
export async function GET(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId')?.trim();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    await requireProjectAccess(request, projectId);
    const snap = await adminDb.collection(PROJECTS_COLLECTION).doc(projectId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const data = snap.data() as Project | undefined;
    return NextResponse.json({
      ok: true,
      intakeEnabled: data?.intakeEnabled ?? false,
      intakeAutoCreate: data?.intakeAutoCreate ?? false,
      intakeToken: data?.intakeToken ?? null,
      intakeWelcomeMessage: data?.intakeWelcomeMessage ?? null,
      intakeUpdatedAt: data?.intakeUpdatedAt ?? null,
      hasClickUpList: Boolean(data?.clickupListId),
      clickupListName: data?.clickupListName ?? null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — enable/disable, rotate token, toggle auto-create. */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  let body: SettingsBody | null = null;
  try {
    body = (await request.json()) as SettingsBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = body?.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    await requireProjectAccess(request, projectId);
    const projectRef = adminDb.collection(PROJECTS_COLLECTION).doc(projectId);
    const snap = await projectRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const current = snap.data() as Project;

    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
      intakeUpdatedAt: new Date().toISOString(),
    };

    if (typeof body.enabled === 'boolean') updates.intakeEnabled = body.enabled;
    if (typeof body.autoCreate === 'boolean') updates.intakeAutoCreate = body.autoCreate;
    if (typeof body.welcomeMessage === 'string') {
      const trimmed = body.welcomeMessage.trim().slice(0, 600);
      updates.intakeWelcomeMessage = trimmed || null;
    } else if (body.welcomeMessage === null) {
      updates.intakeWelcomeMessage = null;
    }

    // Rotate / mint a token whenever explicitly asked, OR the first time intake
    // is enabled and no token exists yet.
    if (body.rotate || (updates.intakeEnabled === true && !current.intakeToken)) {
      updates.intakeToken = generateIntakeToken();
    }

    await projectRef.update(updates);

    const final = (await projectRef.get()).data() as Project;
    return NextResponse.json({
      ok: true,
      intakeEnabled: final.intakeEnabled ?? false,
      intakeAutoCreate: final.intakeAutoCreate ?? false,
      intakeToken: final.intakeToken ?? null,
      intakeWelcomeMessage: final.intakeWelcomeMessage ?? null,
      intakeUpdatedAt: final.intakeUpdatedAt ?? null,
      hasClickUpList: Boolean(final.clickupListId),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[intake-settings] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
