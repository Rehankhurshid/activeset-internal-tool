import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { isCronAuthorized } from '@/lib/cron-auth';
import { getRequestBaseUrl, triggerScanJobProcessing } from '@/lib/scan-job-dispatch';
import { getScanJob, processScanJobBatch } from '@/services/ScanJobService';
import {
  ensureScanNotificationQueued,
  processQueuedScanNotification,
} from '@/services/ScanNotificationQueueService';

export const maxDuration = 300;

/**
 * Process one durable scan batch. Each invocation handles a small number of pages
 * then re-queues itself if more work remains.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { scanId } = await request.json();

    if (!scanId) {
      return NextResponse.json({ error: 'Missing scanId' }, { status: 400 });
    }

    const baseUrl = getRequestBaseUrl(request.headers.get('host'));
    waitUntil((async () => {
      const result = await processScanJobBatch(scanId);

      if (result.status === 'running') {
        await triggerScanJobProcessing(baseUrl, scanId);
      } else if (result.status === 'completed') {
        // Ensure notification exists and process immediately after scan completes.
        console.log(`[scan-bulk/process] Scan ${scanId} completed — processing notification`);
        const finalJob = await getScanJob(scanId);
        if (finalJob) {
          await ensureScanNotificationQueued({
            scanId: finalJob.scanId,
            projectId: finalJob.projectId,
            projectName: finalJob.projectName,
            scannedPages: Math.max(0, finalJob.current - finalJob.summary.failed),
            totalPages: finalJob.total,
            summary: finalJob.summary,
          }).catch((error) => {
            // Queueing is already attempted in ScanJobService; this ensures one last try.
            console.warn(`[scan-bulk/process] Ensure queue failed for ${scanId}:`, error);
          });
        }
        const notifyResult = await processQueuedScanNotification(scanId).catch((error) => {
          console.error(`[scan-bulk/process] Notification failed for ${scanId}:`, error);
          return { scanId, status: 'failed' as const, error: String(error) };
        });
        console.log(`[scan-bulk/process] Notification result for ${scanId}:`, JSON.stringify(notifyResult));
      }
    })().catch((error) => {
      console.error(`[scan-bulk/process] Background batch failed for ${scanId}:`, error);
    }));

    return NextResponse.json({ accepted: true, scanId });
  } catch (error) {
    console.error('[scan-bulk/process] Failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to process scan batch',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
