import { NextRequest, NextResponse } from 'next/server';
import { pageScanner } from '@/services/PageScanner';

interface LinkCheckResult {
  href: string;
  text: string;
  status: number;
  error?: string;
  isExternal: boolean;
}

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

    // Limit the number of links to check to avoid timeout
    const MAX_LINKS_TO_CHECK = 50;
    const linksToCheck = links.slice(0, MAX_LINKS_TO_CHECK);

    // Check each link in parallel with timeout
    const LINK_TIMEOUT = 5000; // 5 seconds per link

    const checkLink = async (link: { href: string; text: string; isExternal: boolean }): Promise<LinkCheckResult> => {
      try {
        // Resolve relative URLs
        let absoluteUrl = link.href;
        try {
          absoluteUrl = new URL(link.href, url).toString();
        } catch {
          // If URL parsing fails, skip this link
          return {
            href: link.href,
            text: link.text,
            status: 0,
            error: 'Invalid URL format',
            isExternal: link.isExternal
          };
        }

        // Skip mailto, tel, javascript links
        if (absoluteUrl.startsWith('mailto:') || 
            absoluteUrl.startsWith('tel:') || 
            absoluteUrl.startsWith('javascript:')) {
          return {
            href: link.href,
            text: link.text,
            status: 200, // Consider these as valid
            isExternal: link.isExternal
          };
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LINK_TIMEOUT);

        try {
          const response = await fetch(absoluteUrl, {
            method: 'HEAD', // Use HEAD request for efficiency
            signal: controller.signal,
            headers: {
              'User-Agent': 'ActiveSet-LinkChecker/1.0 (+https://activeset.co)',
            },
            redirect: 'follow',
          });

          clearTimeout(timeoutId);

          return {
            href: link.href,
            text: link.text,
            status: response.status,
            isExternal: link.isExternal
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);

          // If HEAD fails, try GET (some servers don't support HEAD)
          if (fetchError instanceof Error && fetchError.name !== 'AbortError') {
            try {
              const controller2 = new AbortController();
              const timeoutId2 = setTimeout(() => controller2.abort(), LINK_TIMEOUT);

              const response = await fetch(absoluteUrl, {
                method: 'GET',
                signal: controller2.signal,
                headers: {
                  'User-Agent': 'ActiveSet-LinkChecker/1.0 (+https://activeset.co)',
                },
                redirect: 'follow',
              });

              clearTimeout(timeoutId2);

              return {
                href: link.href,
                text: link.text,
                status: response.status,
                isExternal: link.isExternal
              };
            } catch {
              // GET also failed
            }
          }

          return {
            href: link.href,
            text: link.text,
            status: 0,
            error: fetchError instanceof Error 
              ? (fetchError.name === 'AbortError' ? 'Timeout' : fetchError.message)
              : 'Unknown error',
            isExternal: link.isExternal
          };
        }
      } catch (error) {
        return {
          href: link.href,
          text: link.text,
          status: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
          isExternal: link.isExternal
        };
      }
    };

    // Check links in batches to avoid overwhelming the server
    const BATCH_SIZE = 10;
    const results: LinkCheckResult[] = [];

    for (let i = 0; i < linksToCheck.length; i += BATCH_SIZE) {
      const batch = linksToCheck.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(checkLink));
      results.push(...batchResults);
    }

    // Filter broken links (4xx, 5xx, or 0 status)
    const brokenLinks = results.filter(r => 
      r.status === 0 || r.status >= 400
    ).map(r => ({
      href: r.href,
      text: r.text,
      status: r.status,
      error: r.error
    }));

    return NextResponse.json({
      success: true,
      totalChecked: results.length,
      totalLinks: links.length,
      brokenLinks,
      validLinks: results.filter(r => r.status > 0 && r.status < 400).length,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Link check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
