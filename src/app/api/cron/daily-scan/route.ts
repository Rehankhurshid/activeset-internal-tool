import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { detectAnomalies } from '@/services/AnomalyDetector';
import { alertService } from '@/services/AlertService';
import { sendAlertNotifications } from '@/services/NotificationService';
import { ProjectLink } from '@/types';

const SCAN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per project
const POLL_INTERVAL_MS = 5000; // 5 seconds

/**
 * Daily cron job to scan all projects with sitemaps,
 * then run anomaly detection and send alerts.
 */
export async function GET(request: NextRequest) {
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[daily-scan] Starting daily scan job at', new Date().toISOString());

    try {
        const allProjects = await projectsService.getAllProjects();
        const projectsWithSitemap = allProjects.filter(
            p => p.sitemapUrl && (p.status || 'current') === 'current'
        );

        console.log(`[daily-scan] Found ${projectsWithSitemap.length} current projects with sitemaps`);

        const results = [];
        const baseUrl = getBaseUrl(request);

        for (const project of projectsWithSitemap) {
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
                        options: { scanCollections: false }
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
                    continue;
                }

                const scanId = scanData.scanId;

                // Wait for scan to complete
                const scanCompleted = await pollScanCompletion(baseUrl, scanId);

                if (!scanCompleted) {
                    console.warn(`[daily-scan] Scan timed out for project ${project.name}`);
                    results.push({
                        projectId: project.id,
                        projectName: project.name,
                        success: false,
                        error: 'Scan timed out',
                        anomalies: 0,
                    });
                    continue;
                }

                // Fetch updated project from Firestore
                const updatedProject = await projectsService.getProject(project.id);
                if (!updatedProject) {
                    results.push({
                        projectId: project.id,
                        projectName: project.name,
                        success: true,
                        anomalies: 0,
                    });
                    continue;
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

            // Delay between projects to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const totalAnomalies = results.reduce((sum, r) => sum + (r.anomalies || 0), 0);
        console.log(`[daily-scan] Completed. ${results.length} projects scanned, ${totalAnomalies} anomalies detected.`);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            projectsScanned: projectsWithSitemap.length,
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
async function pollScanCompletion(baseUrl: string, scanId: string): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < SCAN_TIMEOUT_MS) {
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
