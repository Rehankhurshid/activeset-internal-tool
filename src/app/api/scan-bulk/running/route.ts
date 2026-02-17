import { NextRequest, NextResponse } from 'next/server';
import { getRunningScansForProject, getAllScans } from '@/lib/scan-progress-store';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/scan-bulk/running?projectId=xxx
 * Returns any currently running scans for this project
 * 
 * Used by the dashboard to detect and resume displaying scan progress
 * after a page refresh.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
        return NextResponse.json(
            { error: 'Missing projectId parameter' },
            { status: 400, headers: corsHeaders }
        );
    }

    // Debug: Log all scans in the store
    const allScans = getAllScans();
    console.log(`[scan-bulk/running] All scans in store:`, allScans.length);
    allScans.forEach(scan => {
        console.log(`  - ${scan.scanId}: project=${scan.projectId}, status=${scan.status}, progress=${scan.current}/${scan.total}`);
    });

    const runningScans = getRunningScansForProject(projectId);
    console.log(`[scan-bulk/running] Running scans for project ${projectId}:`, runningScans.length);

    // Return running scans with calculated percentages
    const scansWithProgress = runningScans.map(scan => ({
        scanId: scan.scanId,
        projectId: scan.projectId,
        status: scan.status,
        current: scan.current,
        total: scan.total,
        percentage: scan.total > 0 ? Math.round((scan.current / scan.total) * 100) : 0,
        currentUrl: scan.currentUrl,
        startedAt: scan.startedAt,
        scanCollections: scan.scanCollections,
        targetLinkIds: scan.targetLinkIds,
        completedLinkIds: scan.completedLinkIds
    }));

    return NextResponse.json({
        scans: scansWithProgress,
        hasRunningScans: scansWithProgress.length > 0
    }, { headers: corsHeaders });
}
