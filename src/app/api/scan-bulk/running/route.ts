import { NextRequest, NextResponse } from 'next/server';
import { calculateScanPercentage, getActiveScanJobsForProject } from '@/services/ScanJobService';

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
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId parameter' },
      { status: 400, headers: corsHeaders }
    );
  }

  const scans = await getActiveScanJobsForProject(projectId);
  const responseScans = scans.map((scan) => ({
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
  }));

  return NextResponse.json(
    {
      scans: responseScans,
      hasRunningScans: responseScans.length > 0,
    },
    { headers: corsHeaders }
  );
}
