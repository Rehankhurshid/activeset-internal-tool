import sharp from 'sharp';
import type { ImageContext, ImageFacts, PrecheckVerdict } from './types';

/**
 * Everything that happens to an image before a model sees it.
 *
 * Two jobs. Shrink it — a 4000px hero costs a vision model real time and
 * buys nothing over 1024px — and answer the easy cases without a model at
 * all. A 1x1 tracking pixel does not need eight billion parameters to be
 * called decorative, and on a site with a few hundred images the cheap rules
 * settle a surprising share of them.
 */

export const DEFAULT_MAX_DIM = 1024;

export interface PreparedImage {
  base64: string;
  facts: ImageFacts;
  /** Set when the deterministic rules already know the answer. */
  precheck?: PrecheckVerdict;
  /** SHA-256 of the original bytes, for the cache key. */
  sha256: string;
}

export class ImageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageFetchError';
  }
}

const FETCH_HEADERS = {
  'User-Agent': 'ActiveSet-AltText/1.0 (+https://activeset.co)',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
};

export async function fetchImageBytes(src: string, timeoutMs = 20_000): Promise<Buffer> {
  // Node's fetch refuses file:, and a local path is the natural thing to pass
  // a terminal tool, so those are read straight off disk.
  if (src.startsWith('file://') || (!/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//'))) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const filePath = src.startsWith('file://') ? fileURLToPath(src) : src;
    try {
      return await readFile(filePath);
    } catch (error) {
      throw new ImageFetchError(`Cannot read ${filePath}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    if (comma === -1) throw new ImageFetchError('Malformed data URI');
    return Buffer.from(src.slice(comma + 1), src.includes(';base64') ? 'base64' : 'utf8');
  }

  const res = await fetch(src, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new ImageFetchError(`${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength === 0) throw new ImageFetchError('Empty response');
  return buffer;
}

/**
 * Cheap rules, in the order they are worth checking.
 *
 * Each one is a shape that only ever means "decorative" on a real website.
 * They are deliberately conservative: a false "decorative" hides a real
 * problem, so every threshold here is set where a human would not argue.
 */
export function precheck(facts: ImageFacts, context: ImageContext): PrecheckVerdict | undefined {
  if (context.markedPresentational) {
    return {
      kind: 'decorative',
      certainty: 'high',
      reason: 'The markup already marks it presentational (role=presentation or aria-hidden)',
    };
  }

  const shortSide = Math.min(facts.width, facts.height);
  const longSide = Math.max(facts.width, facts.height);

  if (longSide <= 4) {
    return { kind: 'decorative', certainty: 'high', reason: `${facts.width}x${facts.height} — a tracking or spacer pixel` };
  }

  if (facts.maxChannelStdev < 3) {
    return { kind: 'decorative', certainty: 'high', reason: 'A single flat colour' };
  }

  // Low entropy on its own used to live here, and it was wrong. Sharp measures
  // entropy over the histogram, so a two-tone wordmark — a black logo on one
  // flat background — scores lower than a photograph while being the least
  // decorative thing on the page. The Udemy logo on activeset.co came back at
  // 0.31 and was called a gradient. Entropy is kept as a fact for diagnostics
  // and is never on its own a reason to skip the model.

  if (shortSide <= 3 && facts.aspect >= 20) {
    return { kind: 'decorative', certainty: 'high', reason: 'A hairline rule' };
  }

  // Everything else — small icons, thin banners, low-contrast photographs —
  // goes to the model. They are exactly the cases where a cheap rule is wrong.
  return undefined;
}

export interface PrepareOptions {
  maxDim?: number;
  timeoutMs?: number;
  /** Supply bytes you already have instead of fetching. */
  bytes?: Buffer;
}

export async function prepareImage(
  context: ImageContext,
  options: PrepareOptions = {},
): Promise<PreparedImage> {
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const original = options.bytes ?? (await fetchImageBytes(context.src, options.timeoutMs));

  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(original).digest('hex');

  // `animated: false` takes the first frame of a GIF or animated WebP, which
  // is what alt text describes anyway. SVGs are rasterised by sharp.
  let pipeline = sharp(original, { failOn: 'none', animated: false });
  let metadata: sharp.Metadata;
  try {
    metadata = await pipeline.metadata();
  } catch (error) {
    throw new ImageFetchError(
      `Not an image sharp can read (${error instanceof Error ? error.message : 'unknown'})`,
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new ImageFetchError('Image has no dimensions');

  // SVGs report their declared size, which is often tiny; rasterise them
  // larger so text inside them is legible to the model.
  if (metadata.format === 'svg' && Math.max(width, height) < 512) {
    pipeline = sharp(original, { failOn: 'none', density: 300 });
  }

  const stats = await pipeline.clone().stats();
  const maxChannelStdev = Math.max(...stats.channels.map((c) => c.stdev));

  const facts: ImageFacts = {
    width,
    height,
    format: metadata.format ?? 'unknown',
    bytes: original.byteLength,
    aspect: Math.max(width, height) / Math.max(1, Math.min(width, height)),
    hasAlpha: Boolean(metadata.hasAlpha),
    entropy: stats.entropy,
    maxChannelStdev,
  };

  const verdict = precheck(facts, context);

  // A settled image still gets encoded — cheaply — so a caller that wants to
  // show a thumbnail has one, but it is never sent to the model.
  let resized = pipeline.clone();
  if (Math.max(width, height) > maxDim) {
    resized = resized.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
  }
  // Transparent areas become white rather than black, which is what the image
  // was designed against; otherwise every transparent logo reads to the model
  // as a white mark on a dark background.
  const base64 = (
    await resized.flatten({ background: '#ffffff' }).jpeg({ quality: 82, chromaSubsampling: '4:4:4' }).toBuffer()
  ).toString('base64');

  return { base64, facts, precheck: verdict, sha256 };
}
