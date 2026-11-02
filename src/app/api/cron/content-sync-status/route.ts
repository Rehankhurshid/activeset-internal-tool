import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { refreshAllContentSyncs, whalesyncConfigured } from '@/lib/whalesync';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Hourly: read every content sync linked to Whalesync and record its status,
 * last run and open issues, so the client's chips keep themselves current.
 * Rows not linked to Whalesync are the team's to keep by hand.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!whalesyncConfigured()) {
    return NextResponse.json({ success: true, skipped: 'WHALESYNC_API_KEY is not set' });
  }
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ success: true, skipped: 'firebase-admin is not configured' });
  }
  try {
    const result = await refreshAllContentSyncs();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('[cron/content-sync-status] Failed:', error);
    return NextResponse.json(
      { error: 'Content sync refresh failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
