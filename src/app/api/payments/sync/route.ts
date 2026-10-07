import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { syncIncomingPayments } from '@/modules/payments/infrastructure/payments.sync';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/payments/sync: the "Sync now" button, same work as the cron.
 * `{ since: 'YYYY-MM-DD' | 'all' }` loads older history (no email).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as { since?: unknown };
    const since = typeof body.since === 'string' ? body.since : undefined;
    if (since && since !== 'all' && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      return NextResponse.json({ error: "since must be YYYY-MM-DD or 'all'" }, { status: 400 });
    }
    const summary = await syncIncomingPayments({ since });
    return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/sync POST');
  }
}
