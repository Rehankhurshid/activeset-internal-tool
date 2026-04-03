import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { projectsService } from '@/services/database';
import {
  calculateScanPercentage,
  createScanJob,
  getActiveScanJobsForProject,
  shouldKickScanJob,
} from '@/services/ScanJobService';
import { getRequestBaseUrl, triggerScanJobProcessing } from '@/lib/scan-job-dispatch';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Start a resumable bulk scan job. Processing happens in small server-side batches
 * so scans can safely run well beyond a single serverless request lifetime.
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, options = {} } = await request.json();
    const { scanCollections = false, linkIds } = options;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const activeJobs = await getActiveScanJobsForProject(projectId);
    if (activeJobs.length > 0) {
      const activeJob = activeJobs[0];
      if (shouldKickScanJob(activeJob)) {
        const baseUrl = getRequestBaseUrl(request.headers.get('host'));
        waitUntil(
          triggerScanJobProcessing(baseUrl, activeJob.scanId).catch((error) => {
            console.error(`[scan-bulk] Failed to resume scan ${activeJob.scanId}:`, error);
          })
        );
      }

      return NextResponse.json(
        {
          error: 'A scan is already running for this project',
          scanId: activeJob.scanId,
          current: activeJob.current,
          total: activeJob.total,
          percentage: calculateScanPercentage(activeJob),
          currentUrl: activeJob.currentUrl,
          startedAt: activeJob.startedAt,
          scanCollections: activeJob.scanCollections,
          targetLinkIds: activeJob.targetLinkIds,
          completedLinkIds: activeJob.completedLinkIds,
        },
        { status: 409, headers: corsHeaders }
      );
    }

    const project = await projectsService.getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    let linksToScan = project.links.filter((link) => link.source === 'auto');

    if (Array.isArray(linkIds) && linkIds.length > 0) {
      linksToScan = linksToScan.filter((link) => linkIds.includes(link.id));
    }

    if (!scanCollections) {
      linksToScan = linksToScan.filter((link) => link.pageType !== 'collection');
    }

    if (linksToScan.length === 0) {
      return NextResponse.json(
        {
          scanId: null,
          message: 'No pages to scan',
          totalPages: 0,
        },
        { headers: corsHeaders }
      );
    }

    const job = await createScanJob({
      project,
      linksToScan,
      scanCollections,
    });

    const baseUrl = getRequestBaseUrl(request.headers.get('host'));
    waitUntil(
      triggerScanJobProcessing(baseUrl, job.scanId).catch((error) => {
        console.error(`[scan-bulk] Failed to trigger initial batch for ${job.scanId}:`, error);
      })
    );

    return NextResponse.json(
      {
        scanId: job.scanId,
        totalPages: job.total,
        message: 'Scan started. Poll /api/scan-bulk/status for progress.',
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[scan-bulk] Failed to start scan:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
