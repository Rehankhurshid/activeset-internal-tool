import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  getProjectIdFromRequest,
  requireProjectAccess,
} from '@/lib/api-auth';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { loadProjectAdmin } from '@/services/ScanJobService';
import { runSitemapDiff } from '@/lib/webflow-sitemap-io';

export const runtime = 'nodejs';

/**
 * Webflow ↔ sitemap drift for a single project.
 *  - GET  → return the stored snapshot + ignore list (fast, no recompute).
 *  - POST → recompute against live Webflow pages + sitemap, persist, return.
 */

function connectedFlag(project: {
  webflowConfig?: { siteId?: string; hasApiToken?: boolean };
}): boolean {
  return Boolean(project.webflowConfig?.siteId && project.webflowConfig?.hasApiToken);
}

export async function GET(request: NextRequest) {
  try {
    const projectId = getProjectIdFromRequest(request);
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    await requireProjectAccess(request, projectId);

    if (!hasFirebaseAdminCredentials) {
      return NextResponse.json(
        { error: 'Server not configured (firebase-admin)' },
        { status: 503 }
      );
    }

    const project = await loadProjectAdmin(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      diff: project.webflowSitemapDiff ?? null,
      ignorePaths: project.sitemapIgnorePaths ?? [],
      sitemapUrl: project.sitemapUrl ?? null,
      connected: connectedFlag(project),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[sitemap-diff GET] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const projectId = getProjectIdFromRequest(request);
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    await requireProjectAccess(request, projectId);

    if (!hasFirebaseAdminCredentials) {
      return NextResponse.json(
        { error: 'Server not configured (firebase-admin)' },
        { status: 503 }
      );
    }

    const project = await loadProjectAdmin(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const diff = await runSitemapDiff(project);

    await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).update({
      webflowSitemapDiff: diff,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      diff,
      ignorePaths: project.sitemapIgnorePaths ?? [],
      sitemapUrl: project.sitemapUrl ?? null,
      connected: connectedFlag(project),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[sitemap-diff POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
