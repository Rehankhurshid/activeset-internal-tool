import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { getFoldConnectionStatus } from '@/modules/payments/infrastructure/fold.client';
import { syncIncomingPayments } from '@/modules/payments/infrastructure/payments.sync';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/cron/fold-sync: twice a day (10:00 and 18:00 IST, see vercel.json),
 * read new credits from Fold into incoming_payments and email the new ones.
 * Does nothing until an admin connects Fold on /modules/payments.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const status = await getFoldConnectionStatus();
    if (!status.connected || status.needsReconnect) {
      return NextResponse.json({ success: true, skipped: status.needsReconnect ? 'needs reconnect' : 'not connected' });
    }
    const summary = await syncIncomingPayments();
    console.log('[cron/fold-sync] done', summary);
    return NextResponse.json({ success: summary.ok, ...summary }, { status: summary.ok ? 200 : 500 });
  } catch (err) {
    console.error('[cron/fold-sync] failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
