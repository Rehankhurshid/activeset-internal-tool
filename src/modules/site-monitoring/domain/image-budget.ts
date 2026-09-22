/**
 * How big an image actually needs to be.
 *
 * The rule is the one a designer would give you: an image should be **twice
 * the width it is ever displayed at**, so it stays sharp on a 2× retina
 * screen and not one pixel heavier than that. Everything above that number is
 * bytes a visitor downloads and throws away; everything below it is a blurry
 * image on every modern laptop and phone.
 *
 * The number that matters is therefore not in the markup — it is the width
 * the browser lays the image out at, which only a browser can tell you. This
 * module is the arithmetic around that measurement; `src/lib/image-budget/`
 * does the measuring.
 *
 * Pure and client-safe: the Audit tab and the worker read the same rules.
 */

/** Retina. The whole point. */
export const PIXEL_DENSITY = 2;

/**
 * Past this, the extra pixels stop being visible on any real display and
 * start being a download cost. A full-bleed hero on a 1440 viewport wants
 * 2880; nothing wants more.
 */
export const MAX_TARGET_WIDTH = 3200;

/**
 * Don't churn a client's asset over a rounding error. An image within a fifth
 * of its target is right.
 */
export const OVERSIZE_TOLERANCE = 1.2;

/** Below this share of the target it is visibly soft on a retina screen. */
export const UNDERSIZE_AT = 0.9;

/** Not worth a re-upload, a publish and a cache purge. */
export const MIN_SAVING_BYTES = 30 * 1024;
export const MIN_SAVING_RATIO = 0.2;

export type WeightVerdict =
  /** Bigger than it needs to be. Resizing is a pure win. */
  | 'oversized'
  /** Too small to be sharp on a retina screen. Needs a better original. */
  | 'undersized'
  /** Within tolerance of twice its display width. */
  | 'right'
  /** A vector, or never rendered, or we could not measure it. */
  | 'not_applicable';

export interface ImageMeasurement {
  /** Absolute URL of the asset. */
  src: string;
  /** The widest the browser ever laid it out, in CSS pixels, across viewports. */
  renderedWidth: number;
  /** The widest viewport that width was seen at — for explaining the number. */
  widestAt?: number;
  /** The asset's own pixel width. */
  intrinsicWidth: number;
  intrinsicHeight: number;
  /** Bytes over the wire. */
  bytes: number;
  format: string;
  /** True when the image is laid out but never visible (display:none, 0×0). */
  hidden?: boolean;
  /**
   * Whether the markup offers the browser a choice of sizes.
   *
   * It changes who pays. Without `srcset` every visitor downloads this exact
   * file, so an oversized asset is a bill a phone pays on mobile data. With
   * it, Webflow generates variants and the browser takes a suitable one, so
   * an oversized original mostly costs storage — still worth fixing, less
   * urgent.
   */
  hasSrcset?: boolean;
  /** Bytes the browser actually fetched at the widest viewport, when it differs from the asset. */
  deliveredBytes?: number;
  /** True when the image is a CSS background rather than an `<img>`. */
  isBackground?: boolean;
}

export interface WeightAssessment {
  src: string;
  verdict: WeightVerdict;
  /** What the asset's width should be. */
  targetWidth: number;
  intrinsicWidth: number;
  renderedWidth: number;
  bytes: number;
  /** Bytes we expect to be left after resizing. An estimate until it is encoded. */
  estimatedBytes: number;
  /** bytes − estimatedBytes, never negative. */
  estimatedSaving: number;
  /** Why this verdict, in a clause a person can check. */
  reason: string;
  /** True when resizing is worth doing at all. */
  worthDoing: boolean;
  /** Every visitor downloads this file, because the markup offers no alternative. */
  everyVisitorPays: boolean;
}

/** Vectors scale for free; resizing one is meaningless. */
function isVector(format: string): boolean {
  return format === 'svg' || format === 'svg+xml';
}

export function retinaTarget(renderedWidth: number): number {
  return Math.min(MAX_TARGET_WIDTH, Math.round(renderedWidth * PIXEL_DENSITY));
}

/**
 * File size scales with area, so halving the width is roughly a quarter of
 * the bytes. Real encoders beat that on photographs and miss it on flat
 * graphics, so this is deliberately labelled an estimate everywhere it is
 * shown; the worker replaces it with the measured size once it has actually
 * encoded the file.
 */
export function estimateBytesAtWidth(bytes: number, fromWidth: number, toWidth: number): number {
  if (fromWidth <= 0 || toWidth >= fromWidth) return bytes;
  const areaRatio = (toWidth / fromWidth) ** 2;
  return Math.round(bytes * areaRatio);
}

export function assessImageWeight(measurement: ImageMeasurement): WeightAssessment {
  const { src, renderedWidth, intrinsicWidth, bytes, format } = measurement;
  const base = {
    src,
    intrinsicWidth,
    renderedWidth,
    bytes,
    targetWidth: 0,
    estimatedBytes: bytes,
    estimatedSaving: 0,
    worthDoing: false,
    everyVisitorPays: measurement.hasSrcset === false,
  };

  if (isVector(format)) {
    return { ...base, verdict: 'not_applicable', reason: 'A vector — it scales to any size already' };
  }

  if (measurement.hidden || renderedWidth <= 0) {
    return {
      ...base,
      verdict: 'not_applicable',
      reason: 'Never laid out on the page, so there is no display size to size it against',
    };
  }

  if (intrinsicWidth <= 0) {
    return { ...base, verdict: 'not_applicable', reason: 'The asset’s own dimensions could not be read' };
  }

  const targetWidth = retinaTarget(renderedWidth);

  if (intrinsicWidth < targetWidth * UNDERSIZE_AT) {
    return {
      ...base,
      targetWidth,
      verdict: 'undersized',
      reason: `Displays at ${renderedWidth}px but the file is only ${intrinsicWidth}px wide, so it is soft on a retina screen. It wants a ${targetWidth}px original.`,
    };
  }

  if (intrinsicWidth <= targetWidth * OVERSIZE_TOLERANCE) {
    return {
      ...base,
      targetWidth,
      verdict: 'right',
      reason: `${intrinsicWidth}px for a ${renderedWidth}px slot — about right for retina`,
    };
  }

  const estimatedBytes = estimateBytesAtWidth(bytes, intrinsicWidth, targetWidth);
  const estimatedSaving = Math.max(0, bytes - estimatedBytes);
  const worthDoing = estimatedSaving >= MIN_SAVING_BYTES && estimatedSaving / Math.max(1, bytes) >= MIN_SAVING_RATIO;

  const everyVisitorPays = measurement.hasSrcset === false;
  const delivery = everyVisitorPays
    ? ' There is no srcset, so every visitor downloads this exact file.'
    : '';

  return {
    src,
    verdict: 'oversized',
    targetWidth,
    intrinsicWidth,
    renderedWidth,
    bytes,
    estimatedBytes,
    estimatedSaving,
    worthDoing,
    everyVisitorPays,
    reason: worthDoing
      ? `${intrinsicWidth}px wide but never displayed above ${renderedWidth}px. At ${targetWidth}px it is still sharp on retina.${delivery}`
      : `Larger than it needs to be, but resizing would save under ${Math.round(MIN_SAVING_BYTES / 1024)} KB — not worth a re-upload.`,
  };
}

// ── Roll-up ─────────────────────────────────────────────────────────────────

export interface WeightSummary {
  measured: number;
  oversized: number;
  undersized: number;
  right: number;
  /** Bytes that would come off the site if every worthwhile resize were applied. */
  estimatedSaving: number;
  totalBytes: number;
}

export function summariseWeight(assessments: readonly WeightAssessment[]): WeightSummary {
  const summary: WeightSummary = {
    measured: 0,
    oversized: 0,
    undersized: 0,
    right: 0,
    estimatedSaving: 0,
    totalBytes: 0,
  };

  for (const item of assessments) {
    if (item.verdict === 'not_applicable') continue;
    summary.measured += 1;
    summary.totalBytes += item.bytes;
    if (item.verdict === 'oversized') {
      summary.oversized += 1;
      if (item.worthDoing) summary.estimatedSaving += item.estimatedSaving;
    } else if (item.verdict === 'undersized') {
      summary.undersized += 1;
    } else {
      summary.right += 1;
    }
  }

  return summary;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The widest an image is laid out at, across every viewport it was measured
 * in. A card image is 300px on a phone and 612px on a desktop; the asset has
 * to satisfy the widest, so that is the one the target comes from.
 */
export function widestRendered(
  perViewport: readonly { viewport: number; width: number }[],
): { width: number; viewport?: number } {
  let width = 0;
  let viewport: number | undefined;
  for (const entry of perViewport) {
    if (entry.width > width) {
      width = entry.width;
      viewport = entry.viewport;
    }
  }
  return { width, viewport };
}
