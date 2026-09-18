import { NextRequest, NextResponse } from 'next/server';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';
import {
  canRetrievePortalTokens,
  getActivePortalToken,
  issuePortalToken,
  revokePortalTokens,
  type ClientPortalTokenRecord,
} from '@/lib/client-portal-tokens';
import { portalUrl } from '@/lib/base-url';

export const runtime = 'nodejs';

/**
 * Team-side management of a project's portal link.
 *
 *   GET  /api/client-portal/[projectId]/link            → current state
 *   POST /api/client-portal/[projectId]/link {action}   → enable | rotate | disable
 *
 * Every action needs a signed-in @activeset.co caller with access to the
 * project (project access is team-wide, like the Firestore rules). Tokens are
 * minted and revoked in src/lib/client-portal-tokens.ts inside transactions
 * that also write `clientPortal.enabled` / `activeTokenHash`, so the two
 * switches cannot drift apart.
 *
 * `url` is present in every enable/rotate response (show-once). GET can only
 * re-show it when CLIENT_PORTAL_TOKEN_KEY is configured (`retrievable`);
 * otherwise the Client tab offers Rotate to get a fresh, visible link.
 */

type Action = 'enable' | 'rotate' | 'disable';

interface LinkState {
  enabled: boolean;
  url: string | null;
  /** Whether GET can re-show the URL on this deployment. */
  retrievable: boolean;
  issuedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

function stateFrom(enabled: boolean, record: ClientPortalTokenRecord | null, token: string | null): LinkState {
  const live = enabled && record?.active === true ? record : null;
  return {
    enabled: Boolean(live),
    url: live && token ? portalUrl(token) : null,
    retrievable: canRetrievePortalTokens(),
    issuedAt: live ? live.createdAt : null,
    lastUsedAt: live?.lastUsedAt ?? null,
    useCount: live?.useCount ?? 0,
  };
}

async function readEnabled(projectId: string): Promise<boolean> {
  const snap = await db.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  const portal = (snap.data() as { clientPortal?: { enabled?: unknown } } | undefined)?.clientPortal;
  return portal?.enabled === true;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProjectAccess(req, projectId);
    if (!hasFirebaseAdminCredentials) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }
    const [enabled, active] = await Promise.all([readEnabled(projectId), getActivePortalToken(projectId)]);
    return NextResponse.json(stateFrom(enabled, active?.record ?? null, active?.token ?? null));
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[client-portal/link] GET failed:', err);
    return NextResponse.json({ error: 'Failed to read portal link' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const caller = await requireProjectAccess(req, projectId);
    if (!hasFirebaseAdminCredentials) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }
    const body = (await req.json().catch(() => ({}))) as { action?: Action };
    const action = body.action;
    if (action !== 'enable' && action !== 'rotate' && action !== 'disable') {
      return NextResponse.json({ error: 'action must be enable, rotate or disable' }, { status: 400 });
    }

    if (action === 'disable') {
      await revokePortalTokens(projectId, caller.email, { disable: true });
      return NextResponse.json(stateFrom(false, null, null));
    }

    if (action === 'enable') {
      // Reuse the live link only when the portal is already on. If it was
      // switched off out-of-band (console, client SDK), a previously shared
      // link must not come back to life: issue a fresh one instead.
      const [enabled, active] = await Promise.all([readEnabled(projectId), getActivePortalToken(projectId)]);
      if (enabled && active) {
        return NextResponse.json(stateFrom(true, active.record, active.token));
      }
    }

    const issued = await issuePortalToken({ projectId, createdBy: caller.email });
    return NextResponse.json(stateFrom(true, issued.record, issued.token));
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[client-portal/link] POST failed:', err);
    return NextResponse.json({ error: 'Failed to update portal link' }, { status: 500 });
  }
}
