import { NextRequest, NextResponse } from 'next/server';

/**
 * Resolve the highest-quality favicon/touch-icon for a given website.
 * Falls back to Google's favicon service when nothing is found in the page head.
 *
 * GET /api/favicon?url=<encoded-website-url>
 * Response: { url: string }
 */
export async function GET(request: NextRequest) {
    const target = request.nextUrl.searchParams.get('url');
    if (!target) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

    let pageUrl: URL;
    try {
        pageUrl = new URL(target);
    } catch {
        return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(pageUrl.protocol)) {
        return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }

    const fallback = `https://www.google.com/s2/favicons?domain=${pageUrl.hostname}&sz=128`;

    try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(pageUrl.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ActiveSet-Favicon/1.0)',
                Accept: 'text/html',
            },
            redirect: 'follow',
            signal: ctrl.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return NextResponse.json({ url: fallback });

        const reader = res.body?.getReader();
        if (!reader) return NextResponse.json({ url: fallback });
        const chunks: Uint8Array[] = [];
        let total = 0;
        const MAX = 80_000;
        while (total < MAX) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.byteLength;
        }
        try { await reader.cancel(); } catch { /* noop */ }
        const html = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks));
        const head = html.split(/<\/head>/i)[0] ?? html;
        const best = pickBestIcon(head, pageUrl);
        return NextResponse.json({ url: best ?? fallback });
    } catch {
        return NextResponse.json({ url: fallback });
    }
}

function concat(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
    }
    return out;
}

function pickBestIcon(head: string, base: URL): string | null {
    const linkRegex = /<link\b[^>]*>/gi;
    type Candidate = { href: string; size: number; rank: number };
    const candidates: Candidate[] = [];

    for (const match of head.matchAll(linkRegex)) {
        const tag = match[0];
        const rel = attr(tag, 'rel')?.toLowerCase() ?? '';
        if (!/icon/.test(rel)) continue;
        const href = attr(tag, 'href');
        if (!href) continue;

        const sizesAttr = attr(tag, 'sizes');
        let size = 0;
        if (sizesAttr) {
            const dim = sizesAttr.split(/[ ,]/)[0]?.split('x')[0];
            const n = parseInt(dim ?? '', 10);
            if (!isNaN(n)) size = n;
        }

        let rank = 0;
        if (rel.includes('apple-touch-icon')) {
            rank = 3;
            size = Math.max(size, 180);
        } else if (rel.includes('mask-icon')) {
            rank = 1;
        } else {
            rank = 2;
        }

        candidates.push({ href, size, rank });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.size - a.size || b.rank - a.rank);
    try {
        return new URL(candidates[0].href, base).toString();
    } catch {
        return null;
    }
}

function attr(tag: string, name: string): string | null {
    const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const m = tag.match(re);
    return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
}
