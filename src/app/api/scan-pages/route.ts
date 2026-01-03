import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { pageScanner } from '@/services/PageScanner';
import { getScreenshotService } from '@/services/ScreenshotService';
import { AuditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';
import { computeChangeStatus, computeFieldChanges, generateDiffPatch, computeBodyTextDiff } from '@/lib/scan-utils';
import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot } from '@/types';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
    try {
        const { projectId, linkId, url } = await request.json();

        if (!projectId || !linkId || !url) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log(`[scan-pages] Scanning page: ${url} (Link ID: ${linkId})`);

        // Check if project exists
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

        const existingLink = project.links[linkIndex];
        const prevResult = existingLink.auditResult;

        // Perform scan
        const scanResult = await pageScanner.scan(url);

        // Scan Result validation
        if (!scanResult || !scanResult.contentSnapshot) {
            throw new Error('Scan failed to return valid content snapshot');
        }

        // Compute change status
        const changeStatus = computeChangeStatus(
            scanResult.fullHash,
            scanResult.contentHash,
            prevResult?.fullHash,
            prevResult?.contentHash
        );

        console.log(`[scan-pages] Change status: ${changeStatus}`);

        // Get previous HTML source for diff
        let diffPatch: string | undefined;
        let fieldChanges: FieldChange[] = [];
        let diffSummary: string | undefined;

        if (changeStatus === 'CONTENT_CHANGED' || changeStatus === 'TECH_CHANGE_ONLY') {
            // Get previous source from audit_logs
            try {
                const prevLog = await AuditService.getLatestAuditLog(projectId, linkId);
                // Generate diff if checking content
                if (changeStatus === 'CONTENT_CHANGED' && prevLog?.htmlSource) {
                    diffPatch = generateDiffPatch(prevLog.htmlSource, scanResult.htmlSource || '') || undefined;

                    // Compute detailed body text diff
                    const bodyDiff = computeBodyTextDiff(prevLog.htmlSource, scanResult.htmlSource);

                    // Compute specific field changes
                    const prevSnapshot = prevResult?.contentSnapshot;
                    if (prevSnapshot) {
                        fieldChanges = computeFieldChanges(scanResult.contentSnapshot, prevSnapshot);

                        // If we have a better body diff, replace the simple one
                        if (bodyDiff) {
                            fieldChanges = fieldChanges.filter(c => c.field !== 'bodyText');
                            fieldChanges.push(bodyDiff);
                        }

                        if (fieldChanges.length > 0) {
                            diffSummary = fieldChanges.map(c =>
                                `${c.changeType === 'modified' ? 'Updated' : c.changeType === 'added' ? 'Added' : 'Removed'} ${c.field}`
                            ).join(', ');
                        }
                    }
                }
            } catch (err) {
                console.error('Error generating diff/changes:', err);
                // Continue without expanded diff
            }
        }

        const lastRunTimestamp = new Date().toISOString();

        // Save audit result to project link
        const auditResult = {
            score: scanResult.score,
            summary: diffSummary || `Scan completed. Status: ${changeStatus}`,
            canDeploy: scanResult.canDeploy,
            fullHash: scanResult.fullHash,
            contentHash: scanResult.contentHash,
            changeStatus,
            lastRun: lastRunTimestamp,
            contentSnapshot: scanResult.contentSnapshot,
            categories: scanResult.categories,
            // screenshot: null - feature disabled
            // screenshotCapturedAt: null
        };

        // Update project link
        const updatedLinks = [...project.links];
        updatedLinks[linkIndex] = {
            ...existingLink,
            title: scanResult.contentSnapshot.title || existingLink.title, // Update title if changed
            auditResult
        };

        await projectsService.updateProjectLinks(projectId, updatedLinks);

        // Save to audit_logs for history
        const auditLogData: Record<string, unknown> = {
            projectId,
            linkId,
            url,
            timestamp: lastRunTimestamp,
            fullHash: scanResult.fullHash,
            contentHash: scanResult.contentHash,
            htmlSource: scanResult.htmlSource
        };
        if (diffPatch) auditLogData.diffPatch = diffPatch;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await AuditService.saveAuditLog(auditLogData as any);

        // Check if we have any history for this link to bootstrap if needed
        const latestLog = await changeLogService.getLatestEntry(linkId);
        const hasHistory = !!latestLog;

        // If content changed (and scan succeeded), log to change log.
        // Also log if it's the first time we're tracking this link (history bootstrap), 
        // even if hashes match previous auditResult (legacy data).
        if ((changeStatus !== 'NO_CHANGE' && changeStatus !== 'SCAN_FAILED') || !hasHistory) {
            const entryType: 'FIRST_SCAN' | 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY' = !hasHistory
                ? 'FIRST_SCAN'
                : (changeStatus as 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY');

            await changeLogService.saveEntry({
                projectId,
                linkId,
                url,
                timestamp: lastRunTimestamp,
                changeType: entryType,
                fieldChanges,
                summary: diffSummary || (entryType === 'FIRST_SCAN' ? 'Initial history snapshot' : 'Changes detected'),
                contentSnapshot: scanResult.contentSnapshot,
                fullHash: scanResult.fullHash,
                contentHash: scanResult.contentHash,
                auditScore: scanResult.score
            });
        }

        return NextResponse.json({
            success: true,
            auditResult,
            changeStatus,
            message: `Page scanned successfully. Status: ${changeStatus}`
        }, { headers: corsHeaders });

    } catch (error) {
        console.error('[scan-pages] Scan failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
