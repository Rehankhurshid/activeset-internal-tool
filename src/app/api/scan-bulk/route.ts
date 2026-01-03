import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { pageScanner } from '@/services/PageScanner';
import { AuditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';
import { computeChangeStatus, computeFieldChanges, generateDiffPatch, computeBodyTextDiff } from '@/lib/scan-utils';
import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot, ProjectLink } from '@/types';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

interface ScanResult {
    linkId: string;
    url: string;
    success: boolean;
    score?: number;
    changeStatus?: ChangeStatus;
    error?: string;
}

interface BulkScanResponse {
    projectId: string;
    totalPages: number;
    scannedPages: number;
    skippedPages: number;
    results: ScanResult[];
    summary: {
        noChange: number;
        techChange: number;
        contentChanged: number;
        failed: number;
    };
}

/**
 * Bulk scan API - scans multiple pages in a project
 * POST body: { projectId, options: { scanCollections?: boolean, linkIds?: string[] } }
 */
export async function POST(request: NextRequest) {
    try {
        const { projectId, options = {} } = await request.json();
        const { scanCollections = false, linkIds } = options;

        if (!projectId) {
            return NextResponse.json(
                { error: 'Missing projectId' },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log(`[scan-bulk] Starting bulk scan for project ${projectId}`);

        // Get project
        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        // Filter links to scan
        let linksToScan = project.links.filter(l => l.source === 'auto');

        // If specific linkIds provided, filter to those
        if (linkIds && Array.isArray(linkIds) && linkIds.length > 0) {
            linksToScan = linksToScan.filter(l => linkIds.includes(l.id));
        }

        // If not scanning collections, filter them out
        if (!scanCollections) {
            linksToScan = linksToScan.filter(l => l.pageType !== 'collection');
        }

        console.log(`[scan-bulk] Scanning ${linksToScan.length} pages (${scanCollections ? 'including' : 'excluding'} collections)`);

        const results: ScanResult[] = [];
        const summary = { noChange: 0, techChange: 0, contentChanged: 0, failed: 0 };

        // Scan pages in sequence to avoid rate limits
        for (const link of linksToScan) {
            try {
                console.log(`[scan-bulk] Scanning: ${link.url}`);

                const { score, changeStatus, updatedLink } = await scanSinglePage(projectId, link, project.links);

                results.push({
                    linkId: link.id,
                    url: link.url,
                    success: true,
                    score,
                    changeStatus
                });

                // Update the link in our local filtered list AND the main project list reference
                // We need to keep 'project.links' up to date for the final save
                const idx = project.links.findIndex(l => l.id === link.id);
                if (idx !== -1 && updatedLink) {
                    project.links[idx] = updatedLink;
                }

                // Batch Save: every 10 items or so (or just save all at end if list is < 100)
                // Saving every 5 items to show progress in UI if user refreshes, but respecting rate limit
                // 5 items * 500ms delay = 2.5 seconds per save => < 1 write/s
                if (results.length % 5 === 0) {
                    console.log('[scan-bulk] Batch saving progress...');
                    await projectsService.updateProjectLinks(projectId, project.links);
                }

                // Update summary
                if (changeStatus === 'NO_CHANGE') summary.noChange++;
                else if (changeStatus === 'TECH_CHANGE_ONLY') summary.techChange++;
                else if (changeStatus === 'CONTENT_CHANGED') summary.contentChanged++;

            } catch (error) {
                console.error(`[scan-bulk] Failed to scan ${link.url}:`, error);
                results.push({
                    linkId: link.id,
                    url: link.url,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                summary.failed++;
            }

            // Small delay between scans to be nice to servers
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Final Save: Ensure all changes are persisted
        console.log('[scan-bulk] Saving final results...');
        await projectsService.updateProjectLinks(projectId, project.links);

        const response: BulkScanResponse = {
            projectId,
            totalPages: project.links.filter(l => l.source === 'auto').length,
            scannedPages: results.filter(r => r.success).length,
            skippedPages: project.links.filter(l => l.source === 'auto').length - linksToScan.length,
            results,
            summary
        };

        console.log(`[scan-bulk] Completed. Scanned: ${response.scannedPages}, Skipped: ${response.skippedPages}, Failed: ${summary.failed}`);

        return NextResponse.json(response, { headers: corsHeaders });

    } catch (error) {
        console.error('[scan-bulk] Bulk scan failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    } finally {
        // FINAL SAVE: Ensure we save everything at the end, even if loop finished or error halfway
        // (If error was catchable inside loop, we continue. If outside, we should try to save what we have)
        // Re-fetching project might be safer but we have local state.
        // If 'project' variable is available and modified.
        // We can't access 'project' here easily due to scope if we don't wrap broad try/catch correctly, 
        // but 'project' is defined inside try.
        // We'll rely on the in-loop saves and one final save inside the try block.
    }
}

/**
 * Scan a single page and update its audit result, saving logs
 */
async function scanSinglePage(
    projectId: string,
    link: ProjectLink,
    allLinks: ProjectLink[]
): Promise<{ score: number; changeStatus: ChangeStatus; updatedLink: ProjectLink }> {
    const scanResult = await pageScanner.scan(link.url);

    // Get previous audit result for comparison
    const prevResult = link.auditResult;

    // Compute change status
    const changeStatus = computeChangeStatus(
        scanResult.fullHash,
        scanResult.contentHash,
        prevResult?.fullHash,
        prevResult?.contentHash
    );

    // Get previous HTML source for diff
    let diffPatch: string | undefined;
    let fieldChanges: FieldChange[] = [];
    let diffSummary: string | undefined;

    if (changeStatus === 'CONTENT_CHANGED' || changeStatus === 'TECH_CHANGE_ONLY') {
        // Get previous source from audit_logs
        try {
            const prevLog = await AuditService.getLatestAuditLog(projectId, link.id);
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
        summary: diffSummary || (changeStatus === 'NO_CHANGE' ? 'No changes detected.' : 'Changes detected.'),
        canDeploy: scanResult.canDeploy,
        fullHash: scanResult.fullHash,
        contentHash: scanResult.contentHash,
        changeStatus,
        lastRun: lastRunTimestamp,
        contentSnapshot: scanResult.contentSnapshot,
        categories: scanResult.categories
    };

    // Return the updated link object instead of saving it immediately
    // This allows bulk operations to batch the save
    const updatedLink: ProjectLink = {
        ...link,
        title: scanResult.contentSnapshot.title || link.title,
        auditResult
    };

    /* REMOVED: Individual project update to avoid Rate Limit (1 write/s per doc) in bulk loop
    const linkIndex = allLinks.findIndex(l => l.id === link.id);
    if (linkIndex >= 0) {
        // ...
        await projectsService.updateProjectLinks(projectId, updatedLinks);
    }
    */

    // Save to audit_logs for history (these are new docs, high write rate allowed)
    // ...

    // Save to audit_logs for history
    const auditLogData: Record<string, unknown> = {
        projectId,
        linkId: link.id,
        url: link.url,
        timestamp: lastRunTimestamp,
        fullHash: scanResult.fullHash,
        contentHash: scanResult.contentHash,
        htmlSource: scanResult.htmlSource
    };
    if (diffPatch) auditLogData.diffPatch = diffPatch;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await AuditService.saveAuditLog(auditLogData as any);

    // Check if we have any history for this link to bootstrap if needed
    const latestLog = await changeLogService.getLatestEntry(link.id);
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
            linkId: link.id,
            url: link.url,
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

    return { score: scanResult.score, changeStatus, updatedLink };
}
