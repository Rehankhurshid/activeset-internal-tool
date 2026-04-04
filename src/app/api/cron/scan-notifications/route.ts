import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { processPendingScanNotifications } from '@/services/ScanNotificationQueueService';

/**
 * Drain queued scan completion notifications.
 *
 * Intended for a lightweight scheduled cron as a fallback in case the
 * completion-status polling path never gets a chance to process the queue.
 */
export async function GET(request: NextRequest) {
    if (!isCronAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const batchSize = Math.max(1, Math.min(
        Number.parseInt(request.nextUrl.searchParams.get('limit') || '10', 10) || 10,
        25
    ));

    try {
        console.log(`[scan-notifications-cron] Starting notification drain (batchSize=${batchSize})`);
        const result = await processPendingScanNotifications(batchSize);
        console.log(`[scan-notifications-cron] Done: sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`);
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...result,
        });
    } catch (error) {
        console.error('[scan-notifications-cron] Failed to process queued notifications:', error);
        return NextResponse.json(
            {
                error: 'Failed to process queued notifications',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
