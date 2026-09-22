import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, getProjectIdFromRequest, requireProjectAccess } from '@/lib/api-auth';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { loadProjectAdmin } from '@/services/ScanJobService';
import { collectFindings, type AuditDecision } from '@/modules/site-monitoring/domain/audit-findings';
import { imagePathKey, needsAltOnSite, type PageCoverage } from '@/modules/site-monitoring/domain/alt-coverage';

/**
 * How the published pages render each image, for the Webflow tab.
 *
 * It runs the Audit tab's own `collectFindings` over the same scans and
 * decisions, so "missing on the live site" is one number, computed one way,
 * on both screens — they used to disagree by a factor of two hundred because
 * one counted what visitors get and the other counted empty library fields.
 *
 * Keyed by `imagePathKey`, because the Assets API and the pages name the same
 * file under different hosts.
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = getProjectIdFromRequest(request) ?? new URL(request.url).searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    await requireProjectAccess(request, projectId);
    if (!hasFirebaseAdminCredentials) {
      return NextResponse.json({ error: 'Server not configured (firebase-admin)' }, { status: 503 });
    }

    const project = await loadProjectAdmin(projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const decisions = (
      await adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection('audit_decisions').get()
    ).docs.map((doc) => ({ ...(doc.data() as Omit<AuditDecision, 'id'>), id: doc.id }));

    const findings = collectFindings(project.links ?? [], decisions);
    const missingOnSite = findings.alt.filter(needsAltOnSite).map((finding) => ({
      key: imagePathKey(finding.src),
      src: finding.src,
      pages: finding.pages.length,
    }));

    const coverage: Record<string, PageCoverage> = {};
    let pagesScanned = 0;
    for (const link of project.links ?? []) {
      const images = (link.auditResult?.contentSnapshot as { images?: { src?: string; alt?: string }[] } | undefined)?.images;
      if (!images) continue;
      pagesScanned += 1;
      const seen = new Set<string>();
      for (const image of images) {
        if (!image.src) continue;
        const key = imagePathKey(image.src);
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = (coverage[key] ??= { pages: 0, withAlt: 0 });
        entry.pages += 1;
        if (image.alt?.trim()) entry.withAlt += 1;
      }
    }

    return NextResponse.json({ success: true, data: { missingOnSite, coverage, pagesScanned } });
  } catch (error) {
    if (error instanceof ApiAuthError) return apiAuthErrorResponse(error);
    console.error('alt-coverage error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
