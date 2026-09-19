import * as cheerio from 'cheerio';
import type { ImageContext } from './types';

// A stale @types/cheerio shadows cheerio 1.x's own types in this project, so
// `CheerioAPI` and the generic `Cheerio<T>` are not what is actually loaded.
// PageScanner already derives its types from `load` for the same reason.
type CheerioRoot = ReturnType<typeof cheerio.load>;
type CheerioSelection = ReturnType<CheerioRoot>;

/**
 * Pull the page apart for what it says about each image.
 *
 * This is where most of the quality comes from, and it is the part the
 * existing scanner does not do: it stores `src`, `alt` and "is it in main",
 * which is enough to count a problem and not nearly enough to fix one. The
 * same headshot is "Priya Sharma" on a team page and "Read Priya's post" in a
 * blog card, and only the surrounding markup can tell those apart.
 */

const FETCH_HEADERS = {
  'User-Agent': 'ActiveSet-AltText/1.0 (+https://activeset.co)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function fetchPage(url: string, timeoutMs = 25_000): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Could not fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

function textOf(value: string | undefined, limit = 300): string | undefined {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function absolute(src: string, pageUrl: string): string | null {
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    return null;
  }
}

/**
 * The best source URL on an `<img>`. Lazy-loading rewrites `src` to a
 * placeholder and keeps the real one in `data-src`; `srcset` carries the
 * largest variant, which is the one worth looking at.
 */
function bestSource($img: CheerioSelection, pageUrl: string): string | null {
  const candidates = [
    $img.attr('data-src'),
    $img.attr('src'),
    $img.attr('data-lazy-src'),
  ].filter((v): v is string => !!v && !v.startsWith('data:image/svg'));

  const srcset = $img.attr('srcset') || $img.attr('data-srcset');
  if (srcset) {
    const widest = srcset
      .split(',')
      .map((entry: string) => {
        const [url, descriptor] = entry.trim().split(/\s+/);
        const width = descriptor?.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
        return { url, width: Number.isFinite(width) ? width : 0 };
      })
      .filter((candidate: { url?: string }) => !!candidate.url)
      .sort((a: { width: number }, b: { width: number }) => b.width - a.width)[0];
    if (widest) candidates.unshift(widest.url);
  }

  for (const candidate of candidates) {
    const resolved = absolute(candidate, pageUrl);
    if (resolved) return resolved;
  }
  return null;
}

function regionOf($: CheerioRoot, el: never): ImageContext['region'] {
  const $el = $(el);
  if ($el.closest('nav').length) return 'nav';
  if ($el.closest('footer').length) return 'footer';
  if ($el.closest('header').length) return 'header';
  if ($el.closest('aside').length) return 'aside';
  if ($el.closest('main, article').length) return 'main';
  return 'body';
}

/**
 * The heading this image belongs to.
 *
 * "Nearest heading above, in document order" is the obvious rule and it is
 * wrong on exactly the markup this tool meets most: a card grid puts the
 * image before its own title, so every card picks up the previous card's
 * heading. On activeset.co that labelled the Peak XV photograph "Luca". So
 * the image's own container is searched first, and document order is only the
 * fallback for prose pages where the heading really does come first.
 */
function headingFor(
  $: CheerioRoot,
  headings: { at: number; text: string }[],
  order: Map<unknown, number>,
  el: never,
): string | undefined {
  let node = $(el).parent();
  for (let depth = 0; depth < 5 && node.length; depth++) {
    const own = node.find('h1, h2, h3, h4, h5, h6').first();
    if (own.length) {
      const text = textOf(own.text(), 160);
      if (text) return text;
    }
    node = node.parent();
  }

  const index = order.get(el);
  if (index === undefined) return undefined;
  let best: string | undefined;
  for (const heading of headings) {
    if (heading.at >= index) break;
    best = heading.text;
  }
  return best;
}

/**
 * A short run of words around the image, for when nothing more structured
 * exists. Walks up to the nearest block with real text rather than grabbing
 * the whole page body, which would drown the useful context.
 */
function nearbyText($: CheerioRoot, el: never): string | undefined {
  let node = $(el).parent();
  for (let depth = 0; depth < 4 && node.length; depth++) {
    const text = textOf(node.text(), 240);
    if (text && text.length > 15) return text;
    node = node.parent();
  }
  return undefined;
}

export interface ExtractedImage extends ImageContext {
  /** The alt currently on the element; empty string means it is missing. */
  currentAlt: string;
  /** Rendered order on the page. */
  order: number;
}

export interface ExtractOptions {
  siteName?: string;
  /** Include images that already have alt text. Off by default: they are not the job. */
  includeDescribed?: boolean;
}

/**
 * Every image on one page, with its context. Deduplicated by absolute URL,
 * because responsive markup renders the same asset several times and a
 * duplicate with alt on one copy is not a finding.
 */
export function extractImageContexts(
  html: string,
  pageUrl: string,
  options: ExtractOptions = {},
): ExtractedImage[] {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const pageTitle = textOf($('title').first().text(), 200);
  const byUrl = new Map<string, ExtractedImage>();
  let order = 0;

  const documentOrder = new Map<unknown, number>();
  $('*').each((index, element) => documentOrder.set(element, index));
  const headings = $('h1, h2, h3, h4, h5, h6')
    .toArray()
    .map((element) => ({ at: documentOrder.get(element) ?? -1, text: textOf($(element).text(), 160) || '' }))
    .filter((h) => h.at >= 0 && h.text)
    .sort((a, b) => a.at - b.at);

  $('img').each((_, element) => {
    const el = element as never;
    const $img = $(el);
    const src = bestSource($img, pageUrl);
    if (!src) return;

    const currentAlt = ($img.attr('alt') || '').trim();
    const existing = byUrl.get(src);
    if (existing) {
      // A non-empty alt anywhere on the page wins, matching how the scanner counts.
      if (!existing.currentAlt && currentAlt) existing.currentAlt = currentAlt;
      return;
    }

    const $link = $img.closest('a');
    const linkHref = $link.attr('href');
    const linkOwnText = textOf($link.clone().find('img').remove().end().text(), 120);
    const $figure = $img.closest('figure');

    byUrl.set(src, {
      src,
      currentAlt,
      order: order++,
      pageUrl,
      pageTitle,
      siteName: options.siteName,
      heading: headingFor($, headings, documentOrder, el),
      caption: textOf($figure.find('figcaption').first().text(), 240),
      title: textOf($img.attr('title'), 160),
      nearbyText: nearbyText($, el),
      linkHref: linkHref ? absolute(linkHref, pageUrl) || linkHref : undefined,
      linkText: linkOwnText,
      region: regionOf($, el),
      className: textOf($img.attr('class'), 160),
      markedPresentational:
        $img.attr('role') === 'presentation' ||
        $img.attr('role') === 'none' ||
        $img.attr('aria-hidden') === 'true',
    });
  });

  const all = [...byUrl.values()];
  return options.includeDescribed ? all : all.filter((image) => !image.currentAlt);
}
