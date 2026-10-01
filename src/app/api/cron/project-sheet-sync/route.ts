import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { serviceAccountEmail, syncAllProjectSheets } from '@/lib/project-sheet';
import { writeAllManagedSheets } from '@/lib/project-sheet-writer';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Every 15 minutes, both directions:
 * - re-read every hand-kept project sheet, so a status the team changed in the
 *   sheet reaches the client's page without anyone pressing Sync (a sheet that
 *   fails keeps its last snapshot and records why);
 * - write every app-kept sheet whose content moved, the safety net behind the
 *   write the app asks for after each edit.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasFirebaseAdminCredentials || !serviceAccountEmail()) {
    return NextResponse.json({ success: true, skipped: 'No service account is configured' });
  }
  try {
    const result = await syncAllProjectSheets();
    const written = await writeAllManagedSheets();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result, managed: written });
  } catch (error) {
    console.error('[cron/project-sheet-sync] Failed:', error);
    return NextResponse.json(
      { error: 'Project sheet sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
