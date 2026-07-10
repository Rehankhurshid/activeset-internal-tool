import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { requireRaycastCaller } from '@/lib/raycast-auth';
import { calculateScanPercentage, getAllActiveScanJobs } from '@/services/ScanJobService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireRaycastCaller(request);
    const scans = await getAllActiveScanJobs();
    return NextResponse.json({
      ok: true,
      scans: scans.map((scan) => ({
        scanId: scan.scanId,
        projectId: scan.projectId,
        projectName: scan.projectName || 'Project',
        status: scan.status,
        current: scan.current,
        total: scan.total,
        percentage: calculateScanPercentage(scan),
        currentUrl: scan.currentUrl,
        startedAt: scan.startedAt,
        scanCollections: scan.scanCollections,
        captureScreenshots: scan.captureScreenshots,
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
