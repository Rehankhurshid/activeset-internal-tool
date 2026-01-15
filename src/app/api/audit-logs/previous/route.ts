import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '@/services/AuditService';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Get the current and previous audit log entries for a link
 * GET /api/audit-logs/previous?projectId=xxx&linkId=xxx
 * 
 * Returns:
 * - current: The most recent audit log (latest scan)
 * - previous: The second most recent audit log (the one before latest)
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const projectId = searchParams.get('projectId');
        const linkId = searchParams.get('linkId');

        if (!projectId || !linkId) {
            return NextResponse.json(
                { error: 'Missing projectId or linkId' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Get the 2 most recent audit logs
        const recentLogs = await AuditService.getRecentAuditLogs(projectId, linkId, 2);

        if (recentLogs.length === 0) {
            return NextResponse.json(
                { error: 'No audit logs found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const currentLog = recentLogs[0]; // Most recent
        const previousLog = recentLogs.length > 1 ? recentLogs[1] : null; // Second most recent

        // Return both current and previous
        // Support both old (screenshot base64) and new (screenshotUrl) formats
        return NextResponse.json({
            current: currentLog ? {
                htmlSource: currentLog.htmlSource,
                screenshotUrl: currentLog.screenshotUrl || (currentLog.screenshot ? `data:image/png;base64,${currentLog.screenshot}` : undefined),
                timestamp: currentLog.timestamp,
                fullHash: currentLog.fullHash,
                contentHash: currentLog.contentHash,
                fieldChanges: currentLog.fieldChanges || [],
                blocks: currentLog.blocks || [],
                textElements: currentLog.textElements || [],
                diffPatch: currentLog.diffPatch
            } : null,
            previous: previousLog ? {
                htmlSource: previousLog.htmlSource,
                screenshotUrl: previousLog.screenshotUrl || (previousLog.screenshot ? `data:image/png;base64,${previousLog.screenshot}` : undefined),
                timestamp: previousLog.timestamp,
                fullHash: previousLog.fullHash,
                contentHash: previousLog.contentHash,
                fieldChanges: previousLog.fieldChanges || [],
                blocks: previousLog.blocks || [],
                textElements: previousLog.textElements || [],
                diffPatch: previousLog.diffPatch
            } : null
        }, { headers: corsHeaders });

    } catch (error) {
        console.error('[audit-logs/previous] Failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
