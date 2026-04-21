export interface SiteContext {
    url: string;
    title: string;
    description: string;
    headings: { h1: string[]; h2: string[] };
    bodyExcerpt: string;
}

/**
 * Fetch a client website and distil to the signals the AI actually needs.
 * Server-side only (no CORS), no JS rendering, no headless browser.
 */
export async function fetchSiteContext(rawUrl: string): Promise<SiteContext | null> {
    let target: URL;
    try {
        target = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    } catch {
        return null;
    }

    try {
        const res = await fetch(target.toString(), {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (compatible; ActiveSetBot/1.0; +https://app.activeset.co)',
                Accept: 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(10_000),
            redirect: 'follow',
        });
        if (!res.ok) return null;

        const html = await res.text();
        return extractSignals(html, target);
    } catch {
        return null;
    }
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

export function formatContextForPrompt(ctx: SiteContext | null): string {
    if (!ctx) return '(no website provided or fetch failed)';
    return [
        `URL: ${ctx.url}`,
        `Title: ${ctx.title || '-'}`,
        `Meta: ${ctx.description || '-'}`,
        `H1: ${ctx.headings.h1.slice(0, 3).join(' | ') || '-'}`,
        `H2: ${ctx.headings.h2.slice(0, 5).join(' | ') || '-'}`,
        `Body excerpt: ${ctx.bodyExcerpt.slice(0, 1400) || '-'}`,
    ].join('\n');
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
