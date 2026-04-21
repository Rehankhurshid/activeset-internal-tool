import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Fetch a client website and return distilled text signals — title, meta
 * description, headings, and a body-text excerpt — so the proposal AI has
 * real ground truth instead of guessing from the company name alone.
 *
 * Runs server-side to bypass CORS. Intentionally lightweight: no JS
 * rendering, no headless browser, no AI. Just HTML → text.
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) {
        return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
        return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }

    try {
        const res = await fetch(target.toString(), {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (compatible; ActiveSetBot/1.0; +https://app.activeset.co)',
                Accept: 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(12_000),
            redirect: 'follow',
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: `Site returned ${res.status}` },
                { status: 502 }
            );
        }

        const html = await res.text();
        const context = extractSignals(html, target);
        return NextResponse.json({ context });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 502 });
    }
}

interface SiteContext {
    url: string;
    title: string;
    description: string;
    headings: { h1: string[]; h2: string[] };
    bodyExcerpt: string;
}

function extractSignals(html: string, url: URL): SiteContext {
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || '';
    const metaDesc =
        firstMatch(
            html,
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
        ) ||
        firstMatch(
            html,
            /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
        ) ||
        '';

    const h1 = allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi, 5);
    const h2 = allMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi, 10);

    // Strip scripts/styles and tags, keep only visible text.
    const stripped = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ')
        .trim();

    return {
        url: url.toString(),
        title: decode(title).slice(0, 200),
        description: decode(metaDesc).slice(0, 400),
        headings: {
            h1: h1.map(decode).map((s) => s.slice(0, 160)),
            h2: h2.map(decode).map((s) => s.slice(0, 160)),
        },
        bodyExcerpt: stripped.slice(0, 2400),
    };
}

function firstMatch(s: string, re: RegExp): string | null {
    const m = s.match(re);
    return m && m[1] ? m[1] : null;
}

function allMatches(s: string, re: RegExp, limit: number): string[] {
    const results: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) && results.length < limit) {
        if (m[1]) results.push(m[1]);
    }
    return results;
}

function decode(s: string): string {
    return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
