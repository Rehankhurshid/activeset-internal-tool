import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { pageScanner } from '@/services/PageScanner';
import { getScreenshotService } from '@/services/ScreenshotService';
import { AuditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';
import { uploadScreenshot } from '@/services/ScreenshotStorageService';
import { computeChangeStatus, computeFieldChanges, generateDiffPatch, computeBodyTextDiff, compactAuditResult } from '@/lib/scan-utils';
import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot } from '@/types';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Remove undefined values from an object recursively (Firestore doesn't accept undefined)
 */
function removeUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(removeUndefined) as T;
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

        console.log(`[scan-pages] URL: ${url}`);
        console.log(`[scan-pages] New Hash: ${scanResult.fullHash.substring(0, 10)} (Content: ${scanResult.contentHash.substring(0, 10)})`);
        console.log(`[scan-pages] Prev Hash: ${prevResult?.fullHash?.substring(0, 10)} (Content: ${prevResult?.contentHash?.substring(0, 10)})`);
        console.log(`[scan-pages] Result: ${changeStatus}`);

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

        // Smart Screenshot Strategy:
        // Only capture screenshots when:
        // 1. First scan (no previous result) - baseline
        // 2. No existing screenshot (pages added before screenshot feature)
        // 3. Any content change detected (CONTENT_CHANGED)
        // Skip for: TECH_CHANGE_ONLY (only scripts/styles) and NO_CHANGE (when screenshot exists)
        const isFirstScan = !prevResult;
        const hasNoScreenshot = !prevResult?.screenshot;
        const shouldCaptureScreenshot = isFirstScan || hasNoScreenshot || changeStatus === 'CONTENT_CHANGED';
        
        let screenshotUrl: string | undefined;
        let previousScreenshotUrl: string | undefined;
        
        if (shouldCaptureScreenshot) {
            const reason = isFirstScan ? 'first scan' : hasNoScreenshot ? 'no existing screenshot' : 'content changed';
            console.log(`[scan-pages] Capturing screenshot: ${reason}`);
            try {
                const screenshotService = getScreenshotService();
                const screenshotResult = await screenshotService.captureScreenshot(url, {
                    width: 1280,
                    height: 800
                });
                
                // Upload screenshot to Firebase Storage and get URL
                screenshotUrl = await uploadScreenshot(
                    projectId,
                    linkId,
                    screenshotResult.screenshot,
                    lastRunTimestamp
                );
                console.log(`[scan-pages] Screenshot uploaded to Storage`);
                
                // Get previous screenshot URL from audit logs for comparison
                if (!isFirstScan) {
                    const prevLog = await AuditService.getLatestAuditLog(projectId, linkId);
                    if (prevLog?.screenshotUrl) {
                        previousScreenshotUrl = prevLog.screenshotUrl;
                    } else if (prevLog?.screenshot) {
                        // Backward compatibility: old logs may have base64
                        previousScreenshotUrl = prevLog.screenshot;
                    }
                }
            } catch (screenshotError) {
                console.warn('[scan-pages] Screenshot capture/upload failed:', screenshotError);
                // Continue without screenshot
            }
        } else {
            console.log(`[scan-pages] Skipping screenshot: no significant change`);
            // Preserve existing screenshot URL if available
            const prevLog = await AuditService.getLatestAuditLog(projectId, linkId);
            if (prevLog?.screenshotUrl) {
                screenshotUrl = prevLog.screenshotUrl;
            } else if (prevLog?.screenshot) {
                // Backward compatibility
                screenshotUrl = prevLog.screenshot;
            }
        }

        // Save audit result to project link (remove undefined values for Firestore)
        const auditResult = removeUndefined({
            score: scanResult.score,
            summary: diffSummary || `Scan completed. Status: ${changeStatus}`,
            canDeploy: scanResult.canDeploy,
            fullHash: scanResult.fullHash,
            contentHash: scanResult.contentHash,
            changeStatus,
            lastRun: lastRunTimestamp,
            contentSnapshot: scanResult.contentSnapshot,
            categories: scanResult.categories,
            screenshotUrl, // URL to screenshot in Firebase Storage
            previousScreenshotUrl, // URL to previous screenshot for comparison UI
            screenshotCapturedAt: screenshotUrl ? lastRunTimestamp : undefined,
            fieldChanges: fieldChanges.length > 0 ? fieldChanges : undefined, // Store field changes for UI
            diffSummary, // Store diff summary for display
        });

        // Update project link with compact auditResult to stay under Firestore 1MB limit
        const updatedLinks = [...project.links];
        updatedLinks[linkIndex] = removeUndefined({
            ...existingLink,
            title: scanResult.contentSnapshot.title || existingLink.title,
            auditResult: compactAuditResult(auditResult)
        });

        await projectsService.updateProjectLinks(projectId, updatedLinks);

        // Save to audit_logs for history ONLY if content changed
        // This saves ~80% storage costs by skipping NO_CHANGE pages
        if (changeStatus !== 'NO_CHANGE') {
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
            // Only store screenshot URL in audit_logs if we actually captured a new one
            if (shouldCaptureScreenshot && screenshotUrl) {
                auditLogData.screenshotUrl = screenshotUrl;
            }
            // Store fieldChanges for easy retrieval in page-details UI
            if (fieldChanges.length > 0) {
                auditLogData.fieldChanges = fieldChanges;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await AuditService.saveAuditLog(auditLogData as any);
        }

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

            await changeLogService.saveEntry(removeUndefined({
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
            }));
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
