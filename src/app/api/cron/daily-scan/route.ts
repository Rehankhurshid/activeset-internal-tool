import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';

/**
 * Daily cron job to scan all projects with sitemaps
 * 
 * This endpoint should be triggered by your hosting platform's cron scheduler:
 * - Vercel: vercel.json with crons config
 * - Railway: Add a scheduled job
 * - Other: External cron service hitting this endpoint
 * 
 * Security: Consider adding a secret header check for production
 */
export async function GET(request: NextRequest) {
    // Optional: Check for cron secret (recommended for production)
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[daily-scan] Starting daily scan job at', new Date().toISOString());

    try {
        // Get all projects with sitemapUrl set
        const allProjects = await projectsService.getAllProjects();
        const projectsWithSitemap = allProjects.filter(p => p.sitemapUrl);

        console.log(`[daily-scan] Found ${projectsWithSitemap.length} projects with sitemaps`);

        const results = [];

        for (const project of projectsWithSitemap) {
            try {
                console.log(`[daily-scan] Scanning project: ${project.name} (${project.id})`);

                // Call bulk scan API for this project (static pages only)
                const response = await fetch(`${getBaseUrl(request)}/api/scan-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: project.id,
                        options: { scanCollections: false }
                    })
                });

                const result = await response.json();
                results.push({
                    projectId: project.id,
                    projectName: project.name,
                    success: response.ok,
                    scannedPages: result.scannedPages || 0,
                    summary: result.summary
                });

            } catch (error) {
                console.error(`[daily-scan] Failed to scan project ${project.id}:`, error);
                results.push({
                    projectId: project.id,
                    projectName: project.name,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            // Delay between projects to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log('[daily-scan] Completed daily scan job');

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            projectsScanned: projectsWithSitemap.length,
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

// Helper to get base URL for internal API calls
function getBaseUrl(request: NextRequest): string {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
}
