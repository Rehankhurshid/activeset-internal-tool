import { NextRequest, NextResponse } from 'next/server';

interface SitemapEntry {
  url: string;
  pathname: string;
  lang?: string;
}

interface ParsedSitemap {
  domain: string;
  totalUrls: number;
  languages: Record<string, number>;
  folders: Record<string, SitemapEntry[]>;
}

async function fetchSitemapXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ActiveSet-Capture/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap (${res.status})`);
  }
  return res.text();
}

function extractTagValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'gi');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

function extractHreflangLangs(xml: string): string[] {
  const regex = /hreflang=["']([^"']+)["']/gi;
  const langs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1].toLowerCase() !== 'x-default') {
      langs.push(match[1].toLowerCase());
    }
  }
  return langs;
}

function detectLangFromPath(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (first && /^[a-z]{2}(-[a-z]{2,4})?$/.test(first)) {
    return first;
  }
  return null;
}

async function parseSitemapRecursive(url: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];

  const xml = await fetchSitemapXml(url);
  const isSitemapIndex = xml.includes('<sitemapindex');

  if (isSitemapIndex) {
    const childUrls = extractTagValues(xml, 'loc');
    const results: string[] = [];
    for (const childUrl of childUrls) {
      const childResults = await parseSitemapRecursive(childUrl, depth + 1);
      results.push(...childResults);
    }
    return results;
  }

  return extractTagValues(xml, 'loc').filter((u) => u.startsWith('http'));
}

export async function GET(request: NextRequest) {
  const sitemapUrl = request.nextUrl.searchParams.get('url');

  if (!sitemapUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  try {
    // Also get hreflang data from the raw XML
    const rawXml = await fetchSitemapXml(sitemapUrl);
    const hreflangs = extractHreflangLangs(rawXml);

    const allUrls = await parseSitemapRecursive(sitemapUrl);
    const unique = [...new Set(allUrls)];

    if (unique.length === 0) {
      return NextResponse.json({ error: 'No URLs found in sitemap' }, { status: 404 });
    }

    // Determine domain
    let domain = '';
    try {
      domain = new URL(unique[0]).hostname;
    } catch { /* ignore */ }

    // Build entries with pathname and language
    const entries: SitemapEntry[] = unique.map((url) => {
      let pathname = '/';
      try {
        pathname = new URL(url).pathname || '/';
      } catch { /* ignore */ }

      const lang = detectLangFromPath(pathname) || undefined;

      return { url, pathname, lang };
    });

    // Count languages
    const languages: Record<string, number> = {};

    // From hreflang attributes first
    for (const lang of hreflangs) {
      languages[lang] = (languages[lang] || 0) + 1;
    }

    // Fallback: from URL paths if no hreflang data
    if (Object.keys(languages).length === 0) {
      for (const entry of entries) {
        if (entry.lang) {
          languages[entry.lang] = (languages[entry.lang] || 0) + 1;
        }
      }
    }

    // Group by folder (first path segment after lang prefix)
    const folders: Record<string, SitemapEntry[]> = {};

    for (const entry of entries) {
      const segments = entry.pathname.split('/').filter(Boolean);

      // Determine folder
      let folder: string;
      const firstSeg = segments[0]?.toLowerCase();
      const isLang = firstSeg && /^[a-z]{2}(-[a-z]{2,4})?$/.test(firstSeg);

      if (segments.length === 0) {
        folder = '/';
      } else if (isLang && segments.length <= 1) {
        folder = '/';
      } else if (isLang && segments.length > 1) {
        folder = `/${segments[1]}`;
      } else {
        folder = `/${segments[0]}`;
      }

      if (!folders[folder]) folders[folder] = [];
      folders[folder].push(entry);
    }

    const result: ParsedSitemap = {
      domain,
      totalUrls: entries.length,
      languages,
      folders,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[parse-sitemap] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse sitemap' },
      { status: 500 }
    );
  }
}
