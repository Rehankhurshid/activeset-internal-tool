import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { fathomConfigured, syncFathomMeetings } from '@/lib/fathom';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Two days back: generous against a missed hour, and Fathom's summaries land late. */
const WINDOW_HOURS = 48;

/**
 * Hourly: file new Fathom calls under the projects whose clients were on
 * them. Everything arrives pending; the Client tab is where the team shares.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!fathomConfigured()) {
    return NextResponse.json({ success: true, skipped: 'FATHOM_API_KEY is not set' });
  }
  try {
    const createdAfter = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
    const result = await syncFathomMeetings({ createdAfter });
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('[cron/fathom-sync] Failed:', error);
    return NextResponse.json(
      { error: 'Fathom sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
