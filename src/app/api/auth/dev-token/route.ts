import { NextRequest, NextResponse } from 'next/server';
import { auth as adminAuth, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

/**
 * POST /api/auth/dev-token — localhost only, never in production.
 *
 * Mints a Firebase custom token for `local-dev@activeset.co` so a local session
 * is a real, signed-in Firebase user rather than the in-memory mock. That
 * matters since the Firestore rules were tightened: writes to `tasks`,
 * `project_timelines`, `project_checklists` and `requests` require
 * `request.auth.token.email` to end in `@activeset.co`, and a mock user carries
 * no auth context at all, so every local write would be rejected.
 *
 * The Auth *user record* must therefore exist with that email — a custom token
 * only carries an `email` claim when the underlying user has one, so minting a
 * token for a bare uid would satisfy `request.auth != null` but still fail
 * `isActiveSetUser()`. The `admin: true` claim additionally satisfies
 * `isAdmin()` for the admin-only matches.
 *
 * Responses: 404 outside development or off localhost (so the route does not
 * even admit to existing), 503 when firebase-admin has no credentials (the
 * caller in src/modules/auth-access/ui/hooks/useAuth.ts then falls back to its
 * mock user), 200 `{ token }` otherwise.
 */

const DEV_EMAIL = 'local-dev@activeset.co';

function isLocalhostRequest(req: NextRequest): boolean {
  const host =
    req.headers.get('host') ||
    req.headers.get('x-forwarded-host') ||
    (() => {
      try {
        return new URL(req.url).host;
      } catch {
        return '';
      }
    })();
  const hostname = host.split(':')[0]?.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

async function getOrCreateDevUid(): Promise<string> {
  try {
    const existing = await adminAuth.getUserByEmail(DEV_EMAIL);
    return existing.uid;
  } catch {
    const created = await adminAuth.createUser({
      email: DEV_EMAIL,
      emailVerified: true,
      displayName: 'Local Dev',
    });
    return created.uid;
  }
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' || !isLocalhostRequest(req)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json(
      { error: 'firebase-admin is not configured; falling back to the mock user' },
      { status: 503 },
    );
  }

  try {
    const uid = await getOrCreateDevUid();
    const token = await adminAuth.createCustomToken(uid, { admin: true });
    return NextResponse.json({ token });
  } catch (error) {
    console.error('[auth/dev-token] failed to mint a local dev token:', error);
    return NextResponse.json({ error: 'Failed to mint a dev token' }, { status: 500 });
  }
}
