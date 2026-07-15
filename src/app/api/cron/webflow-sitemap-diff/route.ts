import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { isCronAuthorized } from '@/lib/cron-auth';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { loadAllProjectsAdmin } from '@/services/ScanJobService';
import { runSitemapDiff } from '@/lib/webflow-sitemap-io';
import { applyIgnore } from '@/services/WebflowSitemapDiffService';
import {
  sendSitemapDriftNotifications,
  type SitemapDriftNotice,
} from '@/services/NotificationService';
import type { Project } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const JOB_BUDGET_MS = 4 * 60 * 1000; // 4 minutes shared across all projects
const CONCURRENCY = 4;

/**
 * Daily cron: for every Webflow-connected project with a configured sitemap,
 * recompute the page drift, persist the snapshot, and send a digest of any
 * NEW (previously-unseen, non-ignored) differences.
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

  console.log('[sitemap-diff-cron] Starting at', new Date().toISOString());

  try {
    const allProjects = await loadAllProjectsAdmin();
    const eligible = allProjects.filter(
      (p) =>
        (p.status || 'current') === 'current' &&
        Boolean(p.webflowConfig?.siteId) &&
        Boolean(p.webflowConfig?.hasApiToken) &&
        Boolean(p.sitemapUrl?.trim())
    );

    console.log(`[sitemap-diff-cron] ${eligible.length} eligible project(s)`);

    const baseUrl = getBaseUrl(request);
    const deadline = Date.now() + JOB_BUDGET_MS;
    const notices: SitemapDriftNotice[] = [];
    const results: Array<{
      projectId: string;
      projectName: string;
      success: boolean;
      error?: string;
      newDrift: number;
    }> = [];

    const checkProject = async (project: Project) => {
      try {
        const previous = project.webflowSitemapDiff;
        const next = await runSitemapDiff(project);

        await adminDb.collection(COLLECTIONS.PROJECTS).doc(project.id).update({
          webflowSitemapDiff: next,
          updatedAt: Timestamp.now(),
        });

        if (next.error) {
          results.push({
            projectId: project.id,
            projectName: project.name,
            success: false,
            error: next.error,
            newDrift: 0,
          });
          return;
        }

        const ignore = project.sitemapIgnorePaths ?? [];
        const prevSitemap = new Set(previous?.missingFromSitemap ?? []);
        const prevWebflow = new Set(previous?.missingFromWebflow ?? []);

        const newMissingFromSitemap = applyIgnore(
          next.missingFromSitemap.filter((p) => !prevSitemap.has(p)),
          ignore
        );
        const newMissingFromWebflow = applyIgnore(
          next.missingFromWebflow.filter((p) => !prevWebflow.has(p)),
          ignore
        );

        const newDrift = newMissingFromSitemap.length + newMissingFromWebflow.length;
        if (newDrift > 0) {
          notices.push({
            projectId: project.id,
            projectName: project.name,
            newMissingFromSitemap,
            newMissingFromWebflow,
          });
        }

        results.push({
          projectId: project.id,
          projectName: project.name,
          success: true,
          newDrift,
        });
      } catch (error) {
        console.error(`[sitemap-diff-cron] Failed for ${project.id}:`, error);
        results.push({
          projectId: project.id,
          projectName: project.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          newDrift: 0,
        });
      }
    };

    const queue = [...eligible];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0 && Date.now() < deadline) {
        const project = queue.shift();
        if (!project) break;
        await checkProject(project);
      }
    });
    await Promise.all(workers);

    const skipped = queue.length;
    if (skipped > 0) {
      console.warn(`[sitemap-diff-cron] Budget exhausted; ${skipped} project(s) skipped`);
    }

    // Digest of NEW drift only.
    await sendSitemapDriftNotifications(notices, baseUrl);

    const totalNewDrift = results.reduce((sum, r) => sum + r.newDrift, 0);
    console.log(
      `[sitemap-diff-cron] Done. ${results.length} checked, ${notices.length} project(s) with new drift (${totalNewDrift} paths).`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      projectsChecked: results.length,
      projectsSkipped: skipped,
      projectsWithNewDrift: notices.length,
      results,
    });
  } catch (error) {
    console.error('[sitemap-diff-cron] Failed:', error);
    return NextResponse.json(
      {
        error: 'Sitemap diff cron failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}
