import { NextRequest, NextResponse } from 'next/server';
import { alertService } from '@/services/AlertService';

/**
 * GET /api/alerts — Fetch alerts
 * Query params: unread=true, limit=N, projectId=X
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const unreadOnly = searchParams.get('unread') === 'true';
        const limitParam = searchParams.get('limit');
        const limitCount = limitParam ? parseInt(limitParam, 10) : 50;

        const alerts = unreadOnly
            ? await alertService.getUnreadAlerts(limitCount)
            : await alertService.getAllAlerts(limitCount);

        return NextResponse.json({ alerts });
    } catch (error) {
        console.error('[alerts] GET failed:', error);
        return NextResponse.json(
            { error: 'Failed to fetch alerts' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/alerts — Mark alerts as read or dismissed
 * Body: { action: 'markRead' | 'markAllRead' | 'dismiss', alertId?: string }
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, alertId } = body;

        switch (action) {
            case 'markRead':
                if (!alertId) {
                    return NextResponse.json({ error: 'alertId required' }, { status: 400 });
                }
                await alertService.markAsRead(alertId);
                break;

            case 'markAllRead':
                await alertService.markAllRead();
                break;

            case 'dismiss':
                if (!alertId) {
                    return NextResponse.json({ error: 'alertId required' }, { status: 400 });
                }
                await alertService.dismissAlert(alertId);
                break;

            default:
                return NextResponse.json(
                    { error: 'Invalid action. Use markRead, markAllRead, or dismiss.' },
                    { status: 400 }
                );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[alerts] PATCH failed:', error);
        return NextResponse.json(
            { error: 'Failed to update alert' },
            { status: 500 }
        );
    }
}
