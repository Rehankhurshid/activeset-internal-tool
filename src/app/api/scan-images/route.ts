import { NextRequest, NextResponse } from 'next/server';
import { pageScanner } from '@/services/PageScanner';
import { projectsService } from '@/services/database';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Lightweight image-only scan for ALT checks.
 * POST /api/scan-images
 * Body: { projectId, linkId, url }
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, linkId, url } = await request.json();

    if (!projectId || !linkId || !url) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    const project = await projectsService.getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const link = project.links.find((l) => l.id === linkId);
    if (!link) {
      return NextResponse.json(
        { error: 'Link not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const result = await pageScanner.scanImagesOnly(url);

    await projectsService.saveImageAltResults(projectId, linkId, {
      totalImages: result.totalImages,
      uniqueMissingAltCount: result.uniqueMissingAltCount,
      images: result.images,
      checkedAt: result.checkedAt,
    });

    return NextResponse.json({
      success: true,
      totalImages: result.totalImages,
      uniqueMissingAltCount: result.uniqueMissingAltCount,
      checkedAt: result.checkedAt,
      message: 'Image ALT scan completed',
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[scan-images] Scan failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
