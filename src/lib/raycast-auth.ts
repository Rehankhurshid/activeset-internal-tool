import 'server-only';

import { NextRequest } from 'next/server';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { ApiAuthError, requireCaller, type AuthedCaller } from '@/lib/api-auth';

const TOKEN_HEADER = 'x-raycast-token';
const EMAIL_HEADER = 'x-activeset-user-email';

function extractRaycastToken(req: NextRequest): string | null {
  const direct = req.headers.get(TOKEN_HEADER);
  if (direct?.trim()) return direct.trim();

  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) return null;
  return token.trim();
}

function requireConfiguredRaycastToken(): string {
  const token = process.env.RAYCAST_API_TOKEN?.trim();
  if (!token) {
    throw new ApiAuthError(401, 'Missing Authorization bearer token');
  }
  return token;
}

function resolveRaycastEmail(req: NextRequest): string {
  const email = req.headers.get(EMAIL_HEADER)?.trim().toLowerCase();
  if (email && email.endsWith('@activeset.co')) return email;
  return 'raycast@activeset.co';
}

/**
 * Raycast supports the same Firebase bearer token as browser clients. For the
 * private internal extension, it can also use a shared `RAYCAST_API_TOKEN`
 * stored in Raycast preferences and Vercel env. Keep this helper scoped to the
 * `/api/raycast/*` facade so the broader app API auth behavior is unchanged.
 */
export async function requireRaycastCaller(req: NextRequest): Promise<AuthedCaller> {
  try {
    return await requireCaller(req);
  } catch (error) {
    if (!(error instanceof ApiAuthError)) throw error;
    const expected = requireConfiguredRaycastToken();
    const provided = extractRaycastToken(req);
    if (!provided || provided !== expected) {
      throw error;
    }
    return {
      uid: 'raycast-extension',
      email: resolveRaycastEmail(req),
      isAdmin: true,
    };
  }
}

export async function requireRaycastProjectAccess(
  req: NextRequest,
  projectId: string,
): Promise<AuthedCaller> {
  const caller = await requireRaycastCaller(req);
  if (!projectId) throw new ApiAuthError(400, 'Missing projectId');
  if (!hasFirebaseAdminCredentials) throw new ApiAuthError(500, 'Server auth is not configured');

  const snap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!snap.exists) throw new ApiAuthError(404, 'Project not found');
  return caller;
}
