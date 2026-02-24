import { NextRequest, NextResponse } from 'next/server';

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractLocUrls(xmlText: string): string[] {
  const locRegex = /<loc>([\s\S]*?)<\/loc>/gi;
  const urls: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xmlText)) !== null) {
    const raw = decodeXmlEntities(match[1].trim());
    if (!raw) continue;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    parsed.hash = '';

    const canonical = parsed.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    urls.push(canonical);
  }

  return urls;
}

export async function GET(request: NextRequest) {
  const sitemapUrl = request.nextUrl.searchParams.get('url')?.trim();

  if (!sitemapUrl) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sitemapUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid sitemap URL.' }, { status: 400 });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Sitemap URL must start with http:// or https://.' }, { status: 400 });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'ActiveSet-Sitemap-Importer/1.0',
        Accept: 'application/xml,text/xml,text/plain,*/*',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch sitemap (${response.status}).` }, { status: 502 });
    }

    const xmlText = await response.text();

    if (/<\s*sitemapindex[\s>]/i.test(xmlText)) {
      return NextResponse.json(
        { error: 'Sitemap index (multilingual) is not supported yet in this importer.' },
        { status: 400 }
      );
    }

    const urls = extractLocUrls(xmlText);
    return NextResponse.json({ urls, count: urls.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    return NextResponse.json({ error: `Could not fetch sitemap: ${message}` }, { status: 502 });
  }
}
