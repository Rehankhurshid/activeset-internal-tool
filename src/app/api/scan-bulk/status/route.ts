import { NextRequest, NextResponse } from 'next/server';
import { getScanProgress } from '@/lib/scan-progress-store';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/scan-bulk/status?scanId=xxx
 * Returns the current progress of a bulk scan operation
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const scanId = searchParams.get('scanId');

    if (!scanId) {
        return NextResponse.json(
            { error: 'Missing scanId parameter' },
            { status: 400, headers: corsHeaders }
        );
    }

    const progress = getScanProgress(scanId);

    if (!progress) {
        return NextResponse.json(
            { 
                error: 'Scan not found',
                message: 'The scan may have expired or never existed. Scans are cleaned up 10 minutes after completion.'
            },
            { status: 404, headers: corsHeaders }
        );
    }

    // Calculate percentage
    const percentage = progress.total > 0 
        ? Math.round((progress.current / progress.total) * 100) 
        : 0;

    return NextResponse.json({
        scanId: progress.scanId,
        projectId: progress.projectId,
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percentage,
        currentUrl: progress.currentUrl,
        startedAt: progress.startedAt,
        scanCollections: progress.scanCollections,
        targetLinkIds: progress.targetLinkIds,
        completedLinkIds: progress.completedLinkIds,
        completedAt: progress.completedAt,
        error: progress.error,
        summary: progress.summary
    }, { headers: corsHeaders });
}
