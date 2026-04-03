import { NextResponse } from 'next/server';
import { calculateScanPercentage, getAllActiveScanJobs } from '@/services/ScanJobService';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  const scans = await getAllActiveScanJobs();

  return NextResponse.json(
    {
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
      })),
      hasRunningScans: scans.length > 0,
    },
    { headers: corsHeaders }
  );
}
