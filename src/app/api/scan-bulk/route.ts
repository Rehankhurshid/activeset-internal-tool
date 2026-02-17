import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { pageScanner } from '@/services/PageScanner';
import { getScreenshotService } from '@/services/ScreenshotService';
import { AuditLogEntry, AuditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';
import { uploadScreenshot } from '@/services/ScreenshotStorageService';
import { computeChangeStatus, computeFieldChanges, generateDiffPatch, computeBodyTextDiff, compactAuditResult } from '@/lib/scan-utils';
import {
    generateScanId,
    initScanProgress,
    markScanPageCompleted,
    updateScanProgress,
    getRunningScansForProject,
    isScanCancelled,
    markScanCancelled
} from '@/lib/scan-progress-store';
import { ChangeLogEntry, ChangeStatus, FieldChange, ProjectLink } from '@/types';

/**
 * Recursively remove undefined values from an object (Firestore doesn't accept undefined)
 */
function removeUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item)) as unknown as T;
    }
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            if (value !== undefined) {
                result[key] = removeUndefined(value);
            }
        }
        return result as T;
    }
    return obj;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Write items sequentially with a small delay to avoid Firestore rate limits
 * This prevents "RESOURCE_EXHAUSTED: Write stream exhausted" errors
 */
async function writeSequentially<T>(
    items: T[],
    writeFn: (item: T) => Promise<unknown>,
    delayMs: number = 50
): Promise<void> {
    for (let i = 0; i < items.length; i++) {
        await writeFn(items[i]);
        // Add small delay between writes to avoid overwhelming Firestore
        if (i < items.length - 1 && delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

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

/**
 * Bulk scan API - scans multiple pages in a project
 * POST body: { projectId, options: { scanCollections?: boolean, linkIds?: string[] } }
 * 
 * Returns immediately with a scanId. Poll /api/scan-bulk/status?scanId=xxx for progress.
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

        // Check if there's already a scan running for this project
        const runningScans = getRunningScansForProject(projectId);
        if (runningScans.length > 0) {
            const activeScan = runningScans[0];
            return NextResponse.json(
                {
                    error: 'A scan is already running for this project',
                    scanId: activeScan.scanId,
                    current: activeScan.current,
                    total: activeScan.total,
                    percentage: activeScan.total > 0 ? Math.round((activeScan.current / activeScan.total) * 100) : 0,
                    currentUrl: activeScan.currentUrl,
                    startedAt: activeScan.startedAt,
                    scanCollections: activeScan.scanCollections,
                    targetLinkIds: activeScan.targetLinkIds,
                    completedLinkIds: activeScan.completedLinkIds
                },
                { status: 409, headers: corsHeaders }
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

        const totalPages = linksToScan.length;

        if (totalPages === 0) {
            return NextResponse.json(
                {
                    scanId: null,
                    message: 'No pages to scan',
                    totalPages: 0
                },
                { headers: corsHeaders }
            );
        }

        // Generate scanId and initialize progress
        const scanId = generateScanId();
        initScanProgress(scanId, projectId, totalPages, {
            scanCollections,
            targetLinkIds: linksToScan.map(link => link.id)
        });

        console.log(`[scan-bulk] Created scan ${scanId} for ${totalPages} pages`);

        // Start the scan in the background (don't await)
        // This allows us to return immediately with the scanId
        runBulkScan(scanId, projectId, project.links, linksToScan, scanCollections).catch(error => {
            console.error(`[scan-bulk] Background scan ${scanId} failed:`, error);
            updateScanProgress(scanId, {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        });

        // Return immediately with scanId
        return NextResponse.json(
            {
                scanId,
                totalPages,
                message: 'Scan started. Poll /api/scan-bulk/status for progress.'
            },
            { headers: corsHeaders }
        );

    } catch (error) {
        console.error('[scan-bulk] Failed to start bulk scan:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

// Pending write data for batching
interface PendingWrite {
    auditLog?: AuditLogEntry;
    changeLogEntry?: Omit<ChangeLogEntry, 'id'>;
}

/**
 * Background function to run the bulk scan
 * Updates progress store as it scans each page
 * Uses batched writes to reduce Firestore costs
 */
async function runBulkScan(
    scanId: string,
    projectId: string,
    allLinks: ProjectLink[],
    linksToScan: ProjectLink[],
    scanCollections: boolean
): Promise<void> {
    console.log(`[scan-bulk] Scanning ${linksToScan.length} pages (${scanCollections ? 'including' : 'excluding'} collections)`);

    const results: ScanResult[] = [];
    const summary = { noChange: 0, techChange: 0, contentChanged: 0, failed: 0 };

    // Keep a mutable copy of all links for updates
    const projectLinks = [...allLinks];

    // Batch pending writes for efficiency
    const pendingAuditLogs: AuditLogEntry[] = [];
    const pendingChangeLogs: Array<Omit<ChangeLogEntry, 'id'>> = [];
    const BATCH_SIZE = 10;
    const CONCURRENCY_LIMIT = 5;

    let currentIndex = 0;
    let pendingLinkUpdates = 0;

    // Simple mutex for thread-safe updates to results/pending arrays
    let isSaving = false;

    // Worker function to process pages
    const worker = async () => {
        while (true) {
            // Check cancellation
            if (isScanCancelled(scanId)) {
                return;
            }

            // Claim next task (atomic-ish in JS event loop)
            const index = currentIndex++;
            if (index >= linksToScan.length) {
                return;
            }
            const link = linksToScan[index];

            // Update progress
            updateScanProgress(scanId, {
                currentUrl: link.url
            });

            try {
                console.log(`[scan-bulk] Scanning (${index + 1}/${linksToScan.length}): ${link.url}`);

                const { score, changeStatus, updatedLink, pendingWrite } = await scanSinglePage(projectId, link);

                // Critical section: Update results and check for batch save
                // We use a simple spin-wait if another worker is saving
                while (isSaving) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // Update local link copy
                const idx = projectLinks.findIndex(l => l.id === link.id);
                if (idx !== -1 && updatedLink) {
                    projectLinks[idx] = updatedLink;
                }

                // Add to pending writes
                if (pendingWrite?.auditLog) pendingAuditLogs.push(pendingWrite.auditLog);
                if (pendingWrite?.changeLogEntry) pendingChangeLogs.push(pendingWrite.changeLogEntry);
                pendingLinkUpdates++;

                // Check if we need to batch save
                if (
                    pendingLinkUpdates >= BATCH_SIZE ||
                    pendingAuditLogs.length >= BATCH_SIZE ||
                    pendingChangeLogs.length >= BATCH_SIZE
                ) {
                    isSaving = true; // Lock
                    try {
                        console.log(`[scan-bulk] Batch saving progress (${results.length + 1}/${linksToScan.length})...`);

                        await projectsService.updateProjectLinks(projectId, projectLinks);
                        pendingLinkUpdates = 0;

                        // Flush pending logs
                        if (pendingAuditLogs.length > 0) {
                            await writeSequentially(pendingAuditLogs, log => AuditService.saveAuditLog(log));
                            pendingAuditLogs.length = 0;
                        }

                        if (pendingChangeLogs.length > 0) {
                            await writeSequentially(pendingChangeLogs, entry => changeLogService.saveEntry(entry));
                            pendingChangeLogs.length = 0;
                        }
                    } finally {
                        isSaving = false; // Unlock
                    }
                }

                // Add to results only after all per-page persistence work above succeeds
                results.push({
                    linkId: link.id,
                    url: link.url,
                    success: true,
                    score,
                    changeStatus
                });

                // Update summary
                if (changeStatus === 'NO_CHANGE') summary.noChange++;
                else if (changeStatus === 'TECH_CHANGE_ONLY') summary.techChange++;
                else if (changeStatus === 'CONTENT_CHANGED') summary.contentChanged++;

            } catch (error) {
                console.error(`[scan-bulk] Failed to scan ${link.url}:`, error);

                while (isSaving) await new Promise(resolve => setTimeout(resolve, 50));

                results.push({
                    linkId: link.id,
                    url: link.url,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                summary.failed++;
            } finally {
                markScanPageCompleted(scanId, link.id);
            }
        }
    };

    // Run workers concurrently
    await Promise.all(Array(Math.min(linksToScan.length, CONCURRENCY_LIMIT)).fill(null).map(() => worker()));

    // Check if cancelled after workers finish
    if (isScanCancelled(scanId)) {
        console.log(`[scan-bulk] Scan cancelled by user.`);

        // Save whatever we have
        await projectsService.updateProjectLinks(projectId, projectLinks);

        if (pendingAuditLogs.length > 0) {
            await writeSequentially(pendingAuditLogs, log => AuditService.saveAuditLog(log));
        }
        if (pendingChangeLogs.length > 0) {
            await writeSequentially(pendingChangeLogs, entry => changeLogService.saveEntry(entry));
        }

        markScanCancelled(scanId);
        return;
    }

    // Final Save
    console.log('[scan-bulk] Saving final results...');
    await projectsService.updateProjectLinks(projectId, projectLinks);

    if (pendingAuditLogs.length > 0) {
        console.log(`[scan-bulk] Writing final ${pendingAuditLogs.length} audit logs...`);
        await writeSequentially(pendingAuditLogs, log => AuditService.saveAuditLog(log));
    }
    if (pendingChangeLogs.length > 0) {
        console.log(`[scan-bulk] Writing final ${pendingChangeLogs.length} change logs...`);
        await writeSequentially(pendingChangeLogs, entry => changeLogService.saveEntry(entry));
    }

    // Mark completed
    updateScanProgress(scanId, {
        current: linksToScan.length,
        currentUrl: '',
        status: 'completed',
        summary
    });

    console.log(`[scan-bulk] Completed scan ${scanId}. Scanned: ${results.filter(r => r.success).length}, Failed: ${summary.failed}`);
}

/**
 * Scan a single page and return audit result + pending writes for batching
 * Does NOT write to Firestore - caller handles batched writes
 */
async function scanSinglePage(
    projectId: string,
    link: ProjectLink
): Promise<{ score: number; changeStatus: ChangeStatus; updatedLink: ProjectLink; pendingWrite: PendingWrite }> {
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

    // Smart Screenshot Strategy:
    // Only capture screenshots when:
    // 1. First scan (no previous result) - baseline
    // 2. No existing screenshot (pages added before screenshot feature)
    // 3. Any content change detected (CONTENT_CHANGED)
    const isFirstScan = !prevResult;
    const hasNoScreenshot = !prevResult?.screenshotUrl && !prevResult?.screenshot;
    const shouldCaptureScreenshot = isFirstScan || hasNoScreenshot || changeStatus === 'CONTENT_CHANGED';

    let screenshotUrl: string | undefined;
    let previousScreenshotUrl: string | undefined;

    if (shouldCaptureScreenshot) {
        try {
            console.log(`[scan-bulk] Capturing screenshot for ${link.url}`);
            const screenshotService = getScreenshotService();
            const screenshotResult = await screenshotService.captureScreenshot(link.url, {
                width: 1280,
                height: 800
            });

            // Upload screenshot to Firebase Storage and get URL
            screenshotUrl = await uploadScreenshot(
                projectId,
                link.id,
                screenshotResult.screenshot,
                lastRunTimestamp
            );

            // Get previous screenshot URL from audit logs for comparison
            if (!isFirstScan) {
                try {
                    const prevLog = await AuditService.getLatestAuditLog(projectId, link.id);
                    if (prevLog?.screenshotUrl) {
                        previousScreenshotUrl = prevLog.screenshotUrl;
                    } else if (prevLog?.screenshot) {
                        // Backward compatibility: old logs may have base64
                        previousScreenshotUrl = prevLog.screenshot;
                    }
                } catch {
                    // Ignore error fetching prev log if slightly fail
                }
            }
        } catch (screenshotError) {
            console.warn(`[scan-bulk] Screenshot capture/upload failed for ${link.url}:`, screenshotError);
            // Continue without screenshot
        }
    } else {
        // Preserve existing screenshot URL if available
        try {
            const prevLog = await AuditService.getLatestAuditLog(projectId, link.id);
            if (prevLog?.screenshotUrl) {
                screenshotUrl = prevLog.screenshotUrl;
            } else if (prevLog?.screenshot) {
                screenshotUrl = prevLog.screenshot;
            }
        } catch {
            // Ignore
        }
    }

    // Save audit result to project link (remove undefined values for Firestore)
    const auditResult = removeUndefined({
        score: scanResult.score,
        summary: diffSummary || (changeStatus === 'NO_CHANGE' ? 'No changes detected.' : 'Changes detected.'),
        canDeploy: scanResult.canDeploy,
        fullHash: scanResult.fullHash,
        contentHash: scanResult.contentHash,
        changeStatus,
        lastRun: lastRunTimestamp,
        contentSnapshot: scanResult.contentSnapshot,
        categories: scanResult.categories,
        screenshotUrl, // Added screenshot
        previousScreenshotUrl, // Added previous screenshot
        screenshotCapturedAt: screenshotUrl ? lastRunTimestamp : undefined
    });

    // Return the updated link object with compact auditResult to stay under Firestore 1MB limit
    const updatedLink: ProjectLink = {
        ...link,
        title: scanResult.contentSnapshot.title || link.title,
        auditResult: compactAuditResult(auditResult)
    };

    // Prepare pending writes for batching (instead of writing immediately)
    const pendingWrite: PendingWrite = {};

    // Prepare audit_log write ONLY if content changed
    // This saves ~80% storage costs by skipping NO_CHANGE pages
    if (changeStatus !== 'NO_CHANGE') {
        const auditLogData: AuditLogEntry = {
            projectId,
            linkId: link.id,
            url: link.url,
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

        pendingWrite.auditLog = auditLogData;
    }

    // Check if we have any history for this link to bootstrap if needed
    const latestLog = await changeLogService.getLatestEntry(link.id);
    const hasHistory = !!latestLog;

    // Prepare change log entry if content changed
    if ((changeStatus !== 'NO_CHANGE' && changeStatus !== 'SCAN_FAILED') || !hasHistory) {
        const entryType: 'FIRST_SCAN' | 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY' = !hasHistory
            ? 'FIRST_SCAN'
            : (changeStatus as 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY');

        pendingWrite.changeLogEntry = removeUndefined<Omit<ChangeLogEntry, 'id'>>({
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

    return { score: scanResult.score, changeStatus, updatedLink, pendingWrite };
}
