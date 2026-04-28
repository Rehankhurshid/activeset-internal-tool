import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { loadAllProjectsAdmin, loadProjectAdmin } from '@/services/ScanJobService';
import { detectAnomalies } from '@/services/AnomalyDetector';
import { alertService } from '@/services/AlertService';
import { healthReportService } from '@/services/HealthReportService';
import { generateHealthReport } from '@/services/HealthReportGenerator';
import { sendAlertNotifications, sendHealthReportNotifications } from '@/services/NotificationService';
import { ProjectLink } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 800;

const JOB_BUDGET_MS = 12 * 60 * 1000; // 12 minutes shared across all project scans
const POLL_INTERVAL_MS = 5000; // 5 seconds
const SCAN_CONCURRENCY = 4;

/**
 * Daily cron job to scan all current projects,
 * then run anomaly detection and send alerts.
 */
export async function GET(request: NextRequest) {
    if (!isCronAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasFirebaseAdminCredentials) {
        return NextResponse.json(
            { error: 'Server not configured (firebase-admin)' },
            { status: 503 }
        );
    }

    console.log('[daily-scan] Starting daily scan job at', new Date().toISOString());

    try {
        const allProjects = await loadAllProjectsAdmin();
        const currentProjectsToScan = allProjects.filter(
            p => (p.status || 'current') === 'current' && p.links?.some(l => l.source === 'auto')
        );

        console.log(`[daily-scan] Found ${currentProjectsToScan.length} current projects to scan`);

        const results: Array<{
            projectId: string;
            projectName: string;
            success: boolean;
            error?: string;
            scannedPages?: number;
            anomalies: number;
        }> = [];
        const baseUrl = getBaseUrl(request);
        const deadline = Date.now() + JOB_BUDGET_MS;

        const scanProject = async (project: typeof currentProjectsToScan[number]) => {
            try {
                console.log(`[daily-scan] Scanning project: ${project.name} (${project.id})`);

                // Snapshot current links BEFORE scan (for anomaly comparison)
                const previousLinks: ProjectLink[] = JSON.parse(JSON.stringify(
                    project.links.filter(l => l.source === 'auto')
                ));

                // Start the bulk scan
                const response = await fetch(`${baseUrl}/api/scan-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: project.id,
                        options: { scanCollections: true }
                    })
                });

                const scanData = await response.json();

                if (!response.ok) {
                    results.push({
                        projectId: project.id,
                        projectName: project.name,
                        success: false,
                        error: scanData?.error || 'Failed to start scan',
                        anomalies: 0,
                    });
                    return;
                }

                const scanId = scanData.scanId;

                if (!scanId) {
                    results.push({
                        projectId: project.id,
                        projectName: project.name,
                        success: true,
                        scannedPages: 0,
                        anomalies: 0,
                    });
                    return;
                }

                // Wait for scan to complete, bounded by the shared job deadline
                const scanCompleted = await pollScanCompletion(baseUrl, scanId, deadline);

                if (!scanCompleted) {
                    console.warn(`[daily-scan] Scan timed out for project ${project.name}`);
                    results.push({
                        projectId: project.id,
                        projectName: project.name,
                        success: false,
                        error: 'Scan timed out',
                        anomalies: 0,
                    });
                    return;
                }

                // Fetch updated project from Firestore
                const updatedProject = await loadProjectAdmin(project.id);
                if (!updatedProject) {
                    results.push({
                        projectId: project.id,
                        projectName: project.name,
                        success: true,
                        anomalies: 0,
                    });
                    return;
                }

                const currentLinks = updatedProject.links.filter(l => l.source === 'auto');

                // Run anomaly detection
                const anomalies = detectAnomalies(
                    project.id,
                    project.name,
                    currentLinks,
                    previousLinks
                );

                if (anomalies.length > 0) {
                    console.log(`[daily-scan] Detected ${anomalies.length} anomalies for ${project.name}`);

                    // Persist alerts to Firestore
                    await alertService.createAlerts(anomalies);

                    // Send notifications (email + slack)
                    await sendAlertNotifications(anomalies, {
                        projectId: project.id,
                        projectName: project.name,
                        baseUrl,
                    });
                }

                results.push({
                    projectId: project.id,
                    projectName: project.name,
                    success: true,
                    scannedPages: currentLinks.length,
                    anomalies: anomalies.length,
                });

            } catch (error) {
                console.error(`[daily-scan] Failed to scan project ${project.id}:`, error);
                results.push({
                    projectId: project.id,
                    projectName: project.name,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    anomalies: 0,
                });
            }
        };

        // Run scans with bounded concurrency so one slow project can't starve the rest
        const queue = [...currentProjectsToScan];
        const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length) }, async () => {
            while (queue.length > 0 && Date.now() < deadline) {
                const project = queue.shift();
                if (!project) break;
                await scanProject(project);
            }
        });
        await Promise.all(workers);

        const skipped = queue.length;
        if (skipped > 0) {
            console.warn(`[daily-scan] Budget exhausted; ${skipped} project(s) skipped this run`);
        }

        const totalAnomalies = results.reduce((sum, r) => sum + (r.anomalies || 0), 0);
        console.log(`[daily-scan] Completed. ${results.length} projects scanned, ${totalAnomalies} anomalies detected.`);

        // Generate daily health report across ALL current projects (not just ones with sitemaps)
        try {
            const currentProjects = allProjects.filter(p => (p.status || 'current') === 'current');
            // Re-fetch projects to get updated audit data
            const freshProjects = await Promise.all(
                currentProjects
                    .filter(p => p.links?.some(l => l.source === 'auto'))
                    .map(p => loadProjectAdmin(p.id))
            );
            const validProjects = freshProjects.filter(Boolean) as typeof currentProjects;

            const report = generateHealthReport(validProjects);
            const reportId = await healthReportService.createReport(report);
            console.log(`[daily-scan] Health report created: ${reportId} (${report.totalIssues} issues across ${report.projectCount} projects)`);

            await sendHealthReportNotifications({ ...report, id: reportId }, baseUrl);
        } catch (error) {
            console.error('[daily-scan] Health report generation failed:', error);
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            projectsScanned: results.length,
            projectsSkipped: skipped,
            totalAnomalies,
            results
        });

    } catch (error) {
        console.error('[daily-scan] Daily scan failed:', error);
        return NextResponse.json(
            { error: 'Daily scan failed', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

/**
 * Poll scan-bulk/status until completed or timeout.
 */
async function pollScanCompletion(baseUrl: string, scanId: string, deadline: number): Promise<boolean> {
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        try {
            const response = await fetch(`${baseUrl}/api/scan-bulk/status?scanId=${scanId}`);
            if (!response.ok) return false;

            const data = await response.json();

            if (data.status === 'completed') return true;
            if (data.status === 'failed' || data.status === 'cancelled') return false;
        } catch {
            // Network error during poll, continue
        }
    }

    return false; // Timed out
}

function getBaseUrl(request: NextRequest): string {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
}
