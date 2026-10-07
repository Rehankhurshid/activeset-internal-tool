import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { syncIncomingPayments } from '@/modules/payments/infrastructure/payments.sync';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** POST /api/payments/sync: the "Sync now" button. Same work as the cron. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const summary = await syncIncomingPayments();
    return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/sync POST');
  }
}
