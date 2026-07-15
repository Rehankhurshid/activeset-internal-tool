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
import { normalizePath } from '@/services/WebflowSitemapDiffService';

export const runtime = 'nodejs';

/**
 * Add/remove a path from a project's Webflow↔sitemap ignore list. The stored
 * diff snapshot is left untouched (its lists are raw); the ignore list is
 * applied at render/notification time, so toggling is instant and reversible.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const projectId = getProjectIdFromRequest(request) || (body.projectId as string) || '';
    const rawPath = typeof body.path === 'string' ? body.path : '';
    const action =
      body.action === 'remove' ? 'remove' : body.action === 'add' ? 'add' : null;

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    if (!rawPath) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json(
        { error: 'Invalid action (expected "add" or "remove")' },
        { status: 400 }
      );
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

    const path = normalizePath(rawPath);
    const current = project.sitemapIgnorePaths ?? [];
    const next =
      action === 'add'
        ? current.includes(path)
          ? current
          : [...current, path]
        : current.filter((p) => p !== path);
    next.sort();

    await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).update({
      sitemapIgnorePaths: next,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      diff: project.webflowSitemapDiff ?? null,
      ignorePaths: next,
      sitemapUrl: project.sitemapUrl ?? null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[sitemap-diff/ignore] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
