import { NextRequest, NextResponse } from 'next/server';
import { requestScanCancel, getScanProgress, markScanCancelled } from '@/lib/scan-progress-store';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/scan-bulk/cancel
 * Body: { scanId: string }
 * 
 * Requests cancellation of a running scan.
 * The scan will stop at the next page boundary.
 */
export async function POST(request: NextRequest) {
    try {
        const { scanId } = await request.json();

        if (!scanId) {
            return NextResponse.json(
                { error: 'Missing scanId' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Check if scan exists
        const progress = getScanProgress(scanId);
        if (!progress) {
            return NextResponse.json(
                { error: 'Scan not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        if (progress.status !== 'running') {
            return NextResponse.json(
                { error: 'Scan is not running', status: progress.status },
                { status: 400, headers: corsHeaders }
            );
        }

        // Request cancellation AND immediately mark as cancelled
        // This prevents race conditions when user starts a new scan right after cancelling
        const cancelled = requestScanCancel(scanId);

        if (cancelled) {
            // Immediately mark as cancelled so getRunningScansForProject won't find it
            markScanCancelled(scanId);
            
            console.log(`[scan-bulk/cancel] Scan cancelled: ${scanId}`);
            return NextResponse.json({
                success: true,
                message: 'Scan cancelled.',
                scanId
            }, { headers: corsHeaders });
        } else {
            return NextResponse.json(
                { error: 'Failed to cancel scan' },
                { status: 500, headers: corsHeaders }
            );
        }

    } catch (error) {
        console.error('[scan-bulk/cancel] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
