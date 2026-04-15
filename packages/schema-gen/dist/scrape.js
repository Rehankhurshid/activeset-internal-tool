"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapePageSignals = scrapePageSignals;
function extractText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function pickAttr(tag, attr) {
    const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i');
    const m = tag.match(re);
    return m ? m[1] : null;
}
function pickMeta(html, name) {
    const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*"${name}"[^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    return tag ? pickAttr(tag, 'content') : null;
}
function pickTags(html, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        const text = extractText(m[1]);
        if (text)
            out.push(text);
    }
    return out;
}
function extractJsonLd(html) {
    const re = /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        try {
            const parsed = JSON.parse(m[1].trim());
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (item && typeof item === 'object')
                        out.push(item);
                }
            }
            else if (parsed && typeof parsed === 'object') {
                out.push(parsed);
            }
        }
        catch {
            /* skip invalid */
        }
    }
    return out;
}
function extractImages(html) {
    const re = /<img\b[^>]*>/gi;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null && out.length < 25) {
        const tag = m[0];
        const src = pickAttr(tag, 'src');
        if (src)
            out.push({ src, alt: pickAttr(tag, 'alt') });
    }
    return out;
}
async function scrapePageSignals(url) {
    const res = await fetch(url, {
        redirect: 'follow',
        headers: {
            'user-agent': 'Mozilla/5.0 (compatible; SchemaGenBot/1.0; +https://activeset.co)',
            accept: 'text/html,application/xhtml+xml',
        },
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? extractText(titleMatch[1]) : null;
    const metaDescription = pickMeta(html, 'description') || pickMeta(html, 'og:description');
    const h1 = pickTags(html, 'h1').slice(0, 10);
    const h2 = pickTags(html, 'h2').slice(0, 20);
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
    const mainText = extractText(bodyMatch ? bodyMatch[0] : html).slice(0, 4000);
    return {
        url,
        title,
        metaDescription,
        h1,
        h2,
        mainText,
        images: extractImages(html),
        existingJsonLd: extractJsonLd(html),
    };
}
