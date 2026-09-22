import type { Browser, Page } from 'puppeteer';
import type { ImageMeasurement } from '@/modules/site-monitoring/domain/image-budget';

/**
 * Measure how wide every image on a page is actually drawn.
 *
 * This is the number the whole feature turns on, and it is not in the HTML.
 * `width="1200"` is frequently absent, frequently a lie, and says nothing
 * about what CSS does to the element. Only a browser laying the page out
 * knows that an image sits in a 612px column, so this drives a real one at
 * several viewports and reads `getBoundingClientRect()`.
 *
 * It is also why this work belongs on a machine that is always on rather than
 * in a serverless function: three viewports, a scroll pass for lazy loading
 * and a settle on each is seconds per page, and a few hundred pages is not a
 * request.
 */

/** Desktop, tablet, phone. An asset must satisfy the widest of them. */
export const DEFAULT_VIEWPORTS = [1440, 768, 390];

export interface MeasureOptions {
  viewports?: number[];
  /** Milliseconds to let each viewport settle after scrolling. */
  settleMs?: number;
  timeoutMs?: number;
  /** Include images painted as CSS backgrounds. On Webflow these are most heroes. */
  includeBackgrounds?: boolean;
}

interface RawImage {
  src: string;
  currentSrc: string;
  width: number;
  naturalWidth: number;
  naturalHeight: number;
  hasSrcset: boolean;
  isBackground: boolean;
}

/**
 * The browser-side collector, as source text rather than a function.
 *
 * `page.evaluate(fn)` serialises the function with `toString()`, and esbuild —
 * which is what tsx and the Next build both run — rewrites every named
 * function to call a `__name` helper that exists in the bundle and not in the
 * page. The result is `ReferenceError: __name is not defined` inside Chrome,
 * from code that looks perfectly fine in the editor. Source text cannot be
 * rewritten, so it is immune, and the argument is baked in because the string
 * form of `evaluate` takes none.
 */
function collectImagesSource(includeBackgrounds: boolean): string {
  return `(() => {
  const includeBackgrounds = ${includeBackgrounds ? 'true' : 'false'};
  const out = [];

  const push = (entry) => {
    if (!entry.src) return;
    const existing = out.find((item) => item.src === entry.src && item.isBackground === entry.isBackground);
    if (existing) {
      // One asset can appear many times; the widest instance is the one the
      // file has to satisfy.
      existing.width = Math.max(existing.width, entry.width);
      existing.naturalWidth = Math.max(existing.naturalWidth, entry.naturalWidth);
      existing.hasSrcset = existing.hasSrcset || entry.hasSrcset;
      return;
    }
    out.push(entry);
  };

  for (const img of Array.from(document.images)) {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);
    const invisible = style.display === 'none' || style.visibility === 'hidden';
    const picture = img.closest('picture');
    // getBoundingClientRect reports the *painted* box, so a carousel that
    // rests its slides at transform: scale(0.8) would measure 20% small and
    // we would resize the asset to something blurry. offsetWidth ignores
    // transforms, so the larger of the two is the safe number. Under-measuring
    // ships a soft image to a client's live site; over-measuring wastes a few
    // kilobytes.
    const layoutWidth = Math.max(Math.round(rect.width), img.offsetWidth || 0);
    push({
      src: img.src,
      currentSrc: img.currentSrc || img.src,
      width: invisible ? 0 : layoutWidth,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      hasSrcset: Boolean(img.srcset) || Boolean(picture && picture.querySelector('source[srcset]')),
      isBackground: false,
    });
  }

  if (includeBackgrounds) {
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const style = window.getComputedStyle(element);
      const background = style.backgroundImage;
      if (!background || background === 'none') continue;
      const match = /url\(["']?(.*?)["']?\)/.exec(background);
      if (!match || !match[1] || match[1].indexOf('data:') === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2) continue;
      let absolute;
      try { absolute = new URL(match[1], document.baseURI).toString(); } catch (e) { continue; }
      push({
        src: absolute,
        currentSrc: absolute,
        width: Math.round(rect.width),
        // A background has no naturalWidth; the caller reads it from the file.
        naturalWidth: 0,
        naturalHeight: 0,
        hasSrcset: false,
        isBackground: true,
      });
    }
  }

  return out;
})()`;
}

/** Walk the page so lazy images load, then return to the top. Source text, for the same reason. */
const SCROLL_THROUGH_SOURCE = `(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  window.scrollTo(0, 0);
})()`;

async function scrollThrough(page: Page, settleMs: number): Promise<void> {
  await page.evaluate(SCROLL_THROUGH_SOURCE);
  await new Promise((resolve) => setTimeout(resolve, settleMs));
}

export interface PageMeasurement {
  pageUrl: string;
  /** Keyed by asset URL. */
  images: ImageMeasurement[];
  viewports: number[];
}

/**
 * Measure one page. The caller owns the browser so a run over many pages pays
 * for one launch, which on a cold Chromium is most of the cost.
 */
export async function measurePage(
  browser: Browser,
  pageUrl: string,
  options: MeasureOptions = {},
): Promise<PageMeasurement> {
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const settleMs = options.settleMs ?? 250;
  const includeBackgrounds = options.includeBackgrounds ?? true;

  const page = await browser.newPage();
  const widest = new Map<string, ImageMeasurement & { widestAt: number }>();

  try {
    await page.setUserAgent('ActiveSet-ImageBudget/1.0 (+https://activeset.co)');
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs ?? 45_000 });

    for (const viewport of viewports) {
      await page.setViewport({ width: viewport, height: 900, deviceScaleFactor: 1 });
      await scrollThrough(page, settleMs);

      const found = (await page.evaluate(collectImagesSource(includeBackgrounds))) as RawImage[];
      for (const image of found) {
        const existing = widest.get(image.src);
        if (existing && existing.renderedWidth >= image.width) {
          existing.hasSrcset = existing.hasSrcset || image.hasSrcset;
          if (!existing.intrinsicWidth && image.naturalWidth) {
            existing.intrinsicWidth = image.naturalWidth;
            existing.intrinsicHeight = image.naturalHeight;
          }
          continue;
        }
        widest.set(image.src, {
          src: image.src,
          renderedWidth: image.width,
          widestAt: viewport,
          intrinsicWidth: image.naturalWidth || existing?.intrinsicWidth || 0,
          intrinsicHeight: image.naturalHeight || existing?.intrinsicHeight || 0,
          bytes: 0,
          format: '',
          hidden: image.width === 0,
          hasSrcset: image.hasSrcset || existing?.hasSrcset,
          isBackground: image.isBackground,
        });
      }
    }
  } finally {
    await page.close().catch(() => undefined);
  }

  return { pageUrl, images: [...widest.values()], viewports };
}

/**
 * Fill in the bytes and true dimensions of each asset.
 *
 * `naturalWidth` is the decoded size, which for a `srcset` image is whichever
 * variant the browser chose rather than the asset itself, and a CSS
 * background has no natural size at all. Both are answered by fetching the
 * file the markup points at.
 */
export async function attachFileFacts(
  images: ImageMeasurement[],
  options: { concurrency?: number; timeoutMs?: number } = {},
): Promise<ImageMeasurement[]> {
  const sharp = (await import('sharp')).default;
  const concurrency = options.concurrency ?? 6;
  const queue = [...images];
  const out: ImageMeasurement[] = [];

  const worker = async () => {
    for (;;) {
      const image = queue.shift();
      if (!image) return;
      try {
        const res = await fetch(image.src, {
          headers: { 'User-Agent': 'ActiveSet-ImageBudget/1.0 (+https://activeset.co)' },
          signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
        out.push({
          ...image,
          bytes: buffer.byteLength,
          format: metadata.format ?? '',
          intrinsicWidth: metadata.width ?? image.intrinsicWidth,
          intrinsicHeight: metadata.height ?? image.intrinsicHeight,
        });
      } catch {
        // An asset we cannot fetch cannot be judged; it is kept with zero
        // bytes so the assessment returns "not applicable" rather than a
        // confident wrong answer.
        out.push(image);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, worker));
  return out;
}
