import 'server-only';
import { NextResponse } from 'next/server';
import { PortalAuthError, verifyPortalToken, type VerifiedPortalToken } from '@/lib/client-portal-tokens';

/**
 * Route-handler guard for the public, token-scoped `/api/portal/[token]/*`
 * endpoints. Kept apart from src/lib/api-auth.ts on purpose: nothing here
 * ever yields an AuthedCaller, so a portal token can never be mistaken for a
 * team identity by a route that imports the wrong helper.
 */
export async function requirePortalToken(token: unknown): Promise<VerifiedPortalToken> {
  return verifyPortalToken(token);
}

export function portalAuthErrorResponse(err: unknown): NextResponse {
  if (err instanceof PortalAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('[client-portal] unexpected error:', err);
  return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
}

export { PortalAuthError };
