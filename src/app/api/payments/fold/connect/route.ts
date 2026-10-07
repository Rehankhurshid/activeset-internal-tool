import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { getBaseUrl } from '@/lib/base-url';
import { startFoldConnect } from '@/modules/payments/infrastructure/fold.client';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';

/**
 * POST /api/payments/fold/connect → { authorizeUrl }. The page sends the
 * admin there; Fold redirects back to /api/payments/fold/callback.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireAdmin(req);
    const redirectUri = `${getBaseUrl()}/api/payments/fold/callback`;
    const authorizeUrl = await startFoldConnect(redirectUri, caller.email);
    return NextResponse.json({ authorizeUrl });
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/fold/connect POST');
  }
}
