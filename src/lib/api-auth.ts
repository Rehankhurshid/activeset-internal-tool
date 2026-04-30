import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { auth as adminAuth, db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

const ADMIN_EMAIL = 'rehan@activeset.co';

export interface AuthedCaller {
  uid: string;
  email: string;
  isAdmin: boolean;
}

export class ApiAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function apiAuthErrorResponse(err: ApiAuthError): NextResponse {
  return NextResponse.json({ error: err.message }, { status: err.status });
}

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Verifies the `Authorization: Bearer <firebase-id-token>` header and returns
 * the caller. Throws {@link ApiAuthError} on any failure — routes should catch
 * and return {@link apiAuthErrorResponse}.
 *
 * Only @activeset.co users are accepted (mirrors the client sign-in restriction).
 */
export async function requireCaller(req: NextRequest): Promise<AuthedCaller> {
  if (!hasFirebaseAdminCredentials) {
    throw new ApiAuthError(500, 'Server auth is not configured');
  }
  const idToken = extractBearerToken(req);
  if (!idToken) {
    throw new ApiAuthError(401, 'Missing Authorization bearer token');
  }
  let decoded: { uid: string; email?: string };
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new ApiAuthError(401, 'Invalid or expired auth token');
  }
  const email = (decoded.email || '').toLowerCase();
  if (!email) {
    throw new ApiAuthError(403, 'Auth token has no email');
  }
  if (!email.endsWith('@activeset.co')) {
    throw new ApiAuthError(403, 'Forbidden');
  }
  return {
    uid: decoded.uid,
    email,
    isAdmin: email === ADMIN_EMAIL,
  };
}

/**
 * Verifies the caller (via {@link requireCaller}) AND that they are the admin.
 * Used for app-level admin-only routes (e.g. Refrens credentials, invoice
 * tracker) where the resource is not tied to a specific project.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthedCaller> {
  const caller = await requireCaller(req);
  if (!caller.isAdmin) {
    throw new ApiAuthError(403, 'Forbidden');
  }
  return caller;
}

/**
 * Verifies the caller (via {@link requireCaller}) AND that the project exists.
 * Returns the caller. Throws {@link ApiAuthError} on any failure.
 *
 * Project access is shared across the @activeset.co domain — `requireCaller`
 * already restricts callers to that domain, which mirrors the Firestore rules
 * for the `projects` collection. Admin-only resources (e.g. invoices, Refrens)
 * must use {@link requireAdmin} instead.
 */
export async function requireProjectAccess(
  req: NextRequest,
  projectId: string
): Promise<AuthedCaller> {
  const caller = await requireCaller(req);
  if (!projectId) {
    throw new ApiAuthError(400, 'Missing projectId');
  }
  const projectSnap = await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).get();
  if (!projectSnap.exists) {
    throw new ApiAuthError(404, 'Project not found');
  }
  const data = projectSnap.data() as { userId?: string } | undefined;
  if (!data) {
    throw new ApiAuthError(404, 'Project not found');
  }
  return caller;
}

/** Read `x-project-id` from the request, or from a query param fallback. */
export function getProjectIdFromRequest(req: NextRequest): string | null {
  const header = req.headers.get('x-project-id');
  if (header) return header;
  const url = new URL(req.url);
  return url.searchParams.get('projectId');
}
