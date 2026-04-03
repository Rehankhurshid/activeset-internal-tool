import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getRequestBaseUrl, triggerScanJobProcessing } from '@/lib/scan-job-dispatch';
import { calculateScanPercentage, getScanJob, shouldKickScanJob } from '@/services/ScanJobService';
import {
  ensureScanNotificationQueued,
  getScanNotificationJob,
  processQueuedScanNotification,
} from '@/services/ScanNotificationQueueService';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scanId = searchParams.get('scanId');

  if (!scanId) {
    return NextResponse.json(
      { error: 'Missing scanId parameter' },
      { status: 400, headers: corsHeaders }
    );
  }

  const job = await getScanJob(scanId);
  if (!job) {
    return NextResponse.json(
      {
        error: 'Scan not found',
        message: 'The scan ID does not exist.',
      },
      { status: 404, headers: corsHeaders }
    );
  }

  if (shouldKickScanJob(job)) {
    const baseUrl = getRequestBaseUrl(request.headers.get('host'));
    waitUntil(
      triggerScanJobProcessing(baseUrl, scanId).catch((error) => {
        console.error(`[scan-bulk/status] Failed to kick scan ${scanId}:`, error);
      })
    );
  }

  let notification = await getScanNotificationJob(scanId);
  if (job.status === 'completed') {
    try {
      await ensureScanNotificationQueued({
        scanId: job.scanId,
        projectId: job.projectId,
        projectName: job.projectName,
        scannedPages: Math.max(0, job.current - job.summary.failed),
        totalPages: job.total,
        summary: job.summary,
      });
      notification = await getScanNotificationJob(scanId);

      if (!notification || notification.status !== 'sent') {
        waitUntil(
          processQueuedScanNotification(scanId).catch((error) => {
            console.error(`[scan-bulk/status] Notification dispatch failed for ${scanId}:`, error);
          })
        );
        notification = await getScanNotificationJob(scanId);
      }
    } catch (error) {
      console.error(`[scan-bulk/status] Notification queue failed for ${scanId}:`, error);
    }
  }

  return NextResponse.json({
    scanId: job.scanId,
    projectId: job.projectId,
    status: job.status,
    current: job.current,
    total: job.total,
    percentage: calculateScanPercentage(job),
    currentUrl: job.currentUrl,
    startedAt: job.startedAt,
    scanCollections: job.scanCollections,
    targetLinkIds: job.targetLinkIds,
    completedLinkIds: job.completedLinkIds,
    completedAt: job.completedAt,
    error: job.error,
    summary: job.summary,
    notificationStatus: notification?.status,
    notificationAttempts: notification?.attempts,
    notificationError: notification?.error,
    notificationSentAt: notification?.sentAt,
  }, { headers: corsHeaders });
}
