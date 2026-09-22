/**
 * What has been done to each image, so nothing is done twice.
 *
 * Before this, every run re-downloaded and re-encoded every image in a group
 * and only then found there was nothing to gain — 60 of 77 on PeakXV's Teams,
 * every time. Worse, a file this tool had already compressed could clear the
 * size threshold on a later pass and be compressed again: a second lossy
 * generation, a little softer each run. An image's index entry says what
 * happened to it, at what width, and what replaced it, and a run skips
 * anything already settled.
 *
 * Keyed by image fingerprint. Webflow gives a changed file a new URL, so the
 * same fingerprint is the same bytes, and a client uploading a new image
 * starts that image with a clean slate automatically.
 *
 * Pure and client-safe: the worker writes it, the Images screen reads it.
 */

export type AltState =
  /** Had ALT in Webflow when last looked at. */
  | 'present'
  /** Written by this tool. */
  | 'added'
  /** Drafted, but held for a person. */
  | 'held'
  /** Settled as decorative: empty on purpose. */
  | 'decorative';

export type OptimiseState =
  /** Replaced by a smaller file, or is that smaller file. */
  | 'optimised'
  /** Checked, and nothing smaller was possible without a visible change. */
  | 'already-optimal'
  /** A site asset Webflow will not let us replace; a copy is ready for Designer. */
  | 'designer-copy'
  /** Tried and failed. Retried on the next run. */
  | 'failed';

export interface ImageIndexEntry {
  fingerprint: string;
  src: string;
  /** 'assets', or the CMS collection id. */
  group?: string;
  alt?: { state: AltState; text?: string; at: string };
  optimise?: {
    state: OptimiseState;
    at: string;
    /** The width it was checked or encoded at. Null means its own dimensions. */
    width: number | null;
    bytesBefore?: number;
    bytesAfter?: number;
    /** On an original: the fingerprint of the file that replaced it. */
    replacedBy?: string;
    /** On a file this tool made: the fingerprint of the original it replaced. */
    replaces?: string;
    designerCopyUrl?: string;
    error?: string;
  };
  updatedAt: string;
}

/**
 * Whether an image can be skipped for optimisation.
 *
 * Settled means optimised or already optimal *at the width being asked for*.
 * A later measurement can still ask for a smaller width than an image was
 * checked at, and that is a genuinely new job; the same width is the same
 * job again. A failure is never settled — the next run tries again.
 */
export function optimiseSettled(
  entry: ImageIndexEntry | undefined,
  targetWidth: number | null,
): { settled: boolean; reason?: string } {
  const done = entry?.optimise;
  if (!done || done.state === 'failed') return { settled: false };
  if (done.state === 'designer-copy') return { settled: true, reason: 'a copy is already in the Designer folder' };

  // Our own output is never re-encoded at its own size: that is the second
  // lossy generation this index exists to prevent.
  if (targetWidth === null) {
    return {
      settled: true,
      reason: done.state === 'optimised' ? 'already optimised' : 'already as small as it gets',
    };
  }
  // Asked for a width: settled only if it was already done at that width or
  // smaller. A narrower measurement is new work.
  if (done.width !== null && done.width <= targetWidth) {
    return { settled: true, reason: `already done at ${done.width}px` };
  }
  return { settled: false };
}
