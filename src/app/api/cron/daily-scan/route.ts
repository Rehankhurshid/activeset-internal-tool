import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { isCronAuthorized } from '@/lib/cron-auth';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { getRequestBaseUrl, triggerScanJobProcessing } from '@/lib/scan-job-dispatch';
import { loadAllProjectDocsAdmin } from '@/lib/audit-admin';
import {
  createScanJob,
  getActiveScanJobsForProject,
  shouldKickScanJob,
} from '@/services/ScanJobService';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Daily: start a scan job for every active project that has discovered pages,
 * then return.
 *
 * This used to start each project's scan over HTTP and poll until it finished,
 * inside a twelve-minute budget shared by every project. Two things were wrong
 * with that. The internal URLs were built from the request's host header,
 * which for a Vercel cron is the protected `*.vercel.app` deployment URL — so
 * every internal call came back as a 302 to the SSO page, the JSON parse
 * threw, and every project was logged as failed. And even when it worked, a
 * site of a few hundred pages could not finish inside the budget, so its
 * anomalies were never checked.
 *
 * Scan jobs are durable and self-retriggering (`/api/scan-bulk/process`), and
 * `/api/cron/scan-jobs` recovers any that stall. Anomaly detection and the
 * per-project notification run when each job completes
 * (`ScanNotificationQueueService`). The cross-project health report has its
 * own cron at 04:00, after the scans have had time to finish.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured (firebase-admin)' }, { status: 503 });
  }

  const startedAt = new Date().toISOString();
  console.log('[daily-scan] Starting at', startedAt);

  try {
    const projects = (await loadAllProjectDocsAdmin()).filter(
      (p) => (p.status || 'current') === 'current' && (p.links ?? []).some((l) => l.source === 'auto'),
    );
    const baseUrl = getRequestBaseUrl(request.headers.get('host'));

    const started: { projectId: string; projectName: string; scanId: string; pages: number }[] = [];
    const resumed: { projectId: string; projectName: string; scanId: string }[] = [];
    const alreadyRunning: { projectId: string; projectName: string; scanId: string }[] = [];
    const failed: { projectId: string; projectName: string; error: string }[] = [];

    for (const project of projects) {
      try {
        const active = await getActiveScanJobsForProject(project.id);
        if (active.length > 0) {
          const job = active[0];
          if (shouldKickScanJob(job)) {
            waitUntil(
              triggerScanJobProcessing(baseUrl, job.scanId).catch((error) => {
                console.error(`[daily-scan] Failed to resume ${job.scanId}:`, error);
              }),
            );
            resumed.push({ projectId: project.id, projectName: project.name, scanId: job.scanId });
          } else {
            alreadyRunning.push({ projectId: project.id, projectName: project.name, scanId: job.scanId });
          }
          continue;
        }

        const linksToScan = (project.links ?? []).filter((l) => l.source === 'auto');
        const job = await createScanJob({
          project,
          linksToScan,
          scanCollections: true,
          captureScreenshots: true,
        });
        waitUntil(
          triggerScanJobProcessing(baseUrl, job.scanId).catch((error) => {
            console.error(`[daily-scan] Failed to kick ${job.scanId}:`, error);
          }),
        );
        started.push({ projectId: project.id, projectName: project.name, scanId: job.scanId, pages: job.total });
      } catch (error) {
        console.error(`[daily-scan] Could not start ${project.name} (${project.id}):`, error);
        failed.push({
          projectId: project.id,
          projectName: project.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(
      `[daily-scan] ${started.length} started, ${resumed.length} resumed, ${alreadyRunning.length} already running, ${failed.length} failed`,
    );

    return NextResponse.json({
      success: true,
      timestamp: startedAt,
      baseUrl,
      projects: projects.length,
      started,
      resumed,
      alreadyRunning,
      failed,
    });
  } catch (error) {
    console.error('[daily-scan] Failed:', error);
    return NextResponse.json(
      { error: 'Daily scan failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
