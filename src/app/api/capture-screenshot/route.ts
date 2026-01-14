import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { getScreenshotService } from '@/services/ScreenshotService';
import { AuditService } from '@/services/AuditService';

// Recursively remove undefined values from objects
function removeUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item)) as T;
    }
    if (typeof obj === 'object') {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            if (value !== undefined) {
                cleaned[key] = removeUndefined(value);
            }
        }
        return cleaned as T;
    }
    return obj;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * On-demand screenshot capture
 * POST body: { projectId, linkId, url }
 * 
 * This allows users to manually trigger screenshot capture
 * without running a full scan.
 */
export async function POST(request: NextRequest) {
    try {
        const { projectId, linkId, url } = await request.json();

        if (!projectId || !linkId || !url) {
            return NextResponse.json(
                { error: 'Missing required fields: projectId, linkId, url' },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log(`[capture-screenshot] Capturing screenshot for: ${url}`);

        // Verify project and link exist
        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const linkIndex = project.links.findIndex(l => l.id === linkId);
        if (linkIndex === -1) {
            return NextResponse.json(
                { error: 'Link not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        // Capture screenshot
        const screenshotService = getScreenshotService();
        const screenshotResult = await screenshotService.captureScreenshot(url, {
            width: 1280,
            height: 800
        });

        const capturedAt = new Date().toISOString();

        // Get previous screenshot for comparison (if any)
        let previousScreenshot: string | undefined;
        const prevLog = await AuditService.getLatestAuditLog(projectId, linkId);
        if (prevLog?.screenshot) {
            previousScreenshot = prevLog.screenshot;
        }

        // Update the project link with the new screenshot
        const existingLink = project.links[linkIndex];
        const updatedLinks = [...project.links];
        
        // Build auditResult, only including previousScreenshot if it exists
        const updatedAuditResult = {
            ...existingLink.auditResult,
            screenshot: screenshotResult.screenshot,
            screenshotCapturedAt: capturedAt,
        };
        if (previousScreenshot) {
            (updatedAuditResult as Record<string, unknown>).previousScreenshot = previousScreenshot;
        }
        
        updatedLinks[linkIndex] = removeUndefined({
            ...existingLink,
            auditResult: updatedAuditResult as typeof existingLink.auditResult
        });

        await projectsService.updateProjectLinks(projectId, updatedLinks);

        // Save screenshot to audit_logs for future comparison
        const auditLogData = {
            projectId,
            linkId,
            url,
            timestamp: capturedAt,
            fullHash: existingLink.auditResult?.fullHash || '',
            contentHash: existingLink.auditResult?.contentHash || '',
            htmlSource: '', // Don't re-fetch HTML for just a screenshot
            screenshot: screenshotResult.screenshot
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await AuditService.saveAuditLog(auditLogData as any);

        console.log(`[capture-screenshot] Screenshot captured successfully`);

        return NextResponse.json({
            success: true,
            screenshot: screenshotResult.screenshot,
            previousScreenshot,
            capturedAt,
            message: 'Screenshot captured successfully'
        }, { headers: corsHeaders });

    } catch (error) {
        console.error('[capture-screenshot] Failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to capture screenshot' },
            { status: 500, headers: corsHeaders }
        );
    }
}
