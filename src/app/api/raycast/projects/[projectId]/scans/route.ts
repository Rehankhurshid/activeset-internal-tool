import { NextRequest, NextResponse } from 'next/server';
import { POST as startBulkScan } from '@/app/api/scan-bulk/route';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastProjectAccess } from '@/lib/raycast-auth';
import { calculateScanPercentage, getActiveScanJobsForProject } from '@/services/ScanJobService';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const scans = await getActiveScanJobsForProject(projectId);
    return NextResponse.json({
      ok: true,
      scans: scans.map((scan) => ({
        scanId: scan.scanId,
        projectId: scan.projectId,
        status: scan.status,
        current: scan.current,
        total: scan.total,
        percentage: calculateScanPercentage(scan),
        currentUrl: scan.currentUrl,
        startedAt: scan.startedAt,
        scanCollections: scan.scanCollections,
        captureScreenshots: scan.captureScreenshots,
        targetLinkIds: scan.targetLinkIds,
        completedLinkIds: scan.completedLinkIds,
      })),
    });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await requireRaycastProjectAccess(request, projectId);
    const body = (await request.json().catch(() => ({}))) as {
      options?: {
        scanCollections?: boolean;
        captureScreenshots?: boolean;
        linkIds?: string[];
        deferProcessing?: boolean;
      };
    };
    const delegatedRequest = new NextRequest(new URL('/api/scan-bulk', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: request.headers.get('host') ?? '',
      },
      body: JSON.stringify({ projectId, options: body.options ?? {} }),
    });
    const response = await startBulkScan(delegatedRequest);
    const data = await response.json().catch(() => ({}));
    return NextResponse.json({ ok: response.ok, ...data }, { status: response.status });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
