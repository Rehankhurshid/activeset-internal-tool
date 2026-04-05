import { NextRequest, NextResponse } from 'next/server';
import { pageScanner } from '@/services/PageScanner';
import { checkBrokenLinks } from '@/services/LinkCheckerService';

/**
 * Check links on a page for broken links
 * POST /api/check-links
 * Body: { projectId, linkId, url }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, linkId, url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // First, scan the page to get all links
    let links: { href: string; text: string; isExternal: boolean }[] = [];
    
    try {
      const scanResult = await pageScanner.scan(url);
      links = scanResult.contentSnapshot.links || [];
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to scan page: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    const summary = await checkBrokenLinks(links, url);

    return NextResponse.json({
      success: true,
      totalChecked: summary.totalChecked,
      totalLinks: summary.totalLinks,
      brokenLinks: summary.brokenLinks,
      validLinks: summary.validLinks,
      checkedAt: summary.checkedAt,
    });
  } catch (error) {
    console.error('Link check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
