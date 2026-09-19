import { NextRequest, NextResponse } from 'next/server';
import { pageScanner } from '@/services/PageScanner';
import { resolveScanTargetUrl } from '@/lib/scan-target-url';
import {
  AuditAdminUnavailableError,
  linkOf,
  loadLinkAuditAdmin,
  loadProjectDocAdmin,
  saveImageAltResultsAdmin,
} from '@/lib/audit-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Image-only scan of one page, for alt-text checks and for verifying a fix.
 * POST /api/scan-images
 * Body: { projectId, linkId, url? }
 *
 * Reads and writes through firebase-admin. The previous version used the
 * browser SDK from this route and failed the rules with "Missing or
 * insufficient permissions" on every click.
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, linkId, url } = await request.json();

    if (!projectId || !linkId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const project = await loadProjectDocAdmin(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });
    }

    const link = linkOf(project, linkId);
    if (!link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404, headers: corsHeaders });
    }

    const previous = await loadLinkAuditAdmin(projectId, linkId);
    const before = (previous?.categories?.seo as { imagesWithoutAlt?: number } | undefined)?.imagesWithoutAlt ?? 0;

    const requestedUrl = typeof url === 'string' && url.trim() ? url.trim() : link.url;
    const targetUrl = resolveScanTargetUrl(requestedUrl, project.links ?? []);
    const result = await pageScanner.scanImagesOnly(targetUrl);

    await saveImageAltResultsAdmin(projectId, linkId, {
      totalImages: result.totalImages,
      uniqueMissingAltCount: result.uniqueMissingAltCount,
      images: result.images,
      checkedAt: result.checkedAt,
    });

    return NextResponse.json(
      {
        success: true,
        scannedUrl: targetUrl,
        totalImages: result.totalImages,
        uniqueMissingAltCount: result.uniqueMissingAltCount,
        before,
        images: result.images,
        checkedAt: result.checkedAt,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    if (error instanceof AuditAdminUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: corsHeaders });
    }
    console.error('[scan-images] Scan failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
