import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { isCronAuthorized } from '@/lib/cron-auth';
import { getRequestBaseUrl, triggerScanJobProcessing } from '@/lib/scan-job-dispatch';
import { processPendingScanNotifications } from '@/services/ScanNotificationQueueService';
import { getRunnableScanJobs } from '@/services/ScanJobService';

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitCount = Math.max(1, Math.min(
    Number.parseInt(request.nextUrl.searchParams.get('limit') || '5', 10) || 5,
    20
  ));

  try {
    const runnableJobs = await getRunnableScanJobs(limitCount);
    const baseUrl = getRequestBaseUrl(request.headers.get('host'));

    for (const job of runnableJobs) {
      waitUntil(
        triggerScanJobProcessing(baseUrl, job.scanId).catch((error) => {
          console.error(`[cron/scan-jobs] Failed to trigger scan ${job.scanId}:`, error);
        })
      );
    }

    const notificationResult = await processPendingScanNotifications(limitCount);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      kickedJobs: runnableJobs.map((job) => job.scanId),
      notificationResult,
    });
  } catch (error) {
    console.error('[cron/scan-jobs] Failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to process scan jobs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
