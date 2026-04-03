import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { generateHealthReport } from '@/services/HealthReportGenerator';
import { sendScanCompletionNotification } from '@/services/NotificationService';

/**
 * POST /api/scan-bulk/notify
 * Called after a scan completes to send notifications.
 * Body: { projectId, scannedPages, totalPages, summary }
 */
export async function POST(request: NextRequest) {
    try {
        const { projectId, scannedPages, totalPages, summary } = await request.json();

        if (!projectId) {
            return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
        }

        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const report = generateHealthReport([project]);
        const projectHealth = report.projects[0] || null;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.activeset.co';

        await sendScanCompletionNotification(
            {
                projectId,
                projectName: project.name,
                baseUrl,
                scannedPages: scannedPages || 0,
                totalPages: totalPages || 0,
                summary: summary || { noChange: 0, techChange: 0, contentChanged: 0, failed: 0 },
            },
            projectHealth
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[scan-notify] Failed:', error);
        return NextResponse.json(
            { error: 'Failed to send notification' },
            { status: 500 }
        );
    }
}
