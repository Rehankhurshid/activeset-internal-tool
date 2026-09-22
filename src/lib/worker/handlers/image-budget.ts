import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { launchMeasuringBrowser } from '@/lib/image-budget/browser';
import { attachFileFacts, measurePage } from '@/lib/image-budget/measure';
import {
  assessImageWeight,
  formatBytes,
  summariseWeight,
  type ImageMeasurement,
  type WeightAssessment,
} from '@/modules/site-monitoring/domain/image-budget';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { placementsFor, type ImagePlacement } from '@/lib/cms/placement';
import { getWebflowTokenAdmin } from '@/lib/project-admin';
import type { Project } from '@/types';

/**
 * Measure a site's images against what it actually displays, and work out
 * what each one should weigh.
 *
 * The optimised files are written to disk rather than pushed at Webflow.
 * Webflow's Assets API can create an asset and edit its metadata, but it
 * cannot replace the bytes of an existing one, and a Designer-placed image
 * cannot be repointed through the API at all. So the honest deliverable is a
 * folder of correctly-sized files next to a report saying exactly which is
 * which — a drag-and-drop job in Designer, and nothing changes on a client's
 * live site without someone doing it.
 */

const IMAGE_BUDGET = 'image_budget';

export interface ImageBudgetPayload {
  /** Specific page URLs. Defaults to the project's discovered pages. */
  pages?: string[];
  /** Stop after this many pages. */
  limit?: number;
  /** Where to write the resized files. Skipped when absent. */
  emitDir?: string;
  viewports?: number[];
}

export interface StoredWeightFinding extends WeightAssessment {
  fingerprint: string;
  /** Pages the asset was seen on. */
  pages: string[];
  widestAt?: number;
  isBackground?: boolean;
  hasSrcset?: boolean;
  /** Real bytes after re-encoding, when the worker produced the file. */
  optimisedBytes?: number;
  /** Where the optimised file was written on the worker machine. */
  optimisedPath?: string;
  /** Which encoding won, or why the image was left alone. */
  optimisedHow?: string;
  /** Where the image lives in Webflow, which decides whether it is fixable. */
  placement?: ImagePlacement;
  /**
   * An optimised copy already in the client's Webflow library, for an image
   * the API cannot swap. Carried across re-measures so a second run does not
   * upload it again and the link stays on the row until the swap is done.
   */
  replacement?: { url: string; assetId: string; name: string; bytes: number; width: number | null };
  format: string;
  measuredAt: string;
}

/**
 * How an image was re-encoded, and whether it was worth it.
 *
 * `null` from the encoder means "leave this one alone" — an animation we
 * would flatten, a vector we would rasterise, or a file we cannot beat.
 */
export interface Encoded {
  bytes: Buffer;
  ext: string;
  /** For the report: which candidate won, so a number can be argued with. */
  how: string;
}

/**
 * Re-encode at a width without a visible change.
 *
 * "Lossless" gets slippery the moment you resize — the resample has already
 * thrown pixels away — so the bar this aims at is *perceptually* lossless:
 * a file nobody could pick out of a line-up beside the original.
 *
 * Two candidates, both of which clear that bar, and the smaller one wins:
 *
 * - **True lossless WebP** reproduces the resized pixels exactly. It is the
 *   right answer for wordmarks and flat graphics, where a handful of colours
 *   compress to almost nothing.
 * - **WebP at quality 90**, with chroma kept at full resolution, is the
 *   accepted visually-lossless setting for continuous-tone images.
 *
 * Choosing one of them for everything is what makes a size pass either
 * pointless or actively harmful. Measured on six of ActiveSet's own images at
 * their 2x target widths: true lossless beat q90 on the wordmark (11 KB
 * against 14 KB) and lost badly on the OG photograph (145 KB against 33 KB)
 * and a long page screenshot (662 KB against 227 KB). Lossless everywhere
 * came out 88% *larger* than the originals; this rule came out 38% smaller,
 * leaving two images untouched because nothing beat them. Because both
 * candidates are already perceptually lossless, deciding between them on size
 * alone cannot cost quality.
 */
export async function encodeAtWidth(
  buffer: Buffer,
  width: number | null,
  format: string,
): Promise<Encoded | null> {
  // A vector has no business being rasterised to a fixed width, and sharp
  // would happily do it.
  if (format === 'svg') return null;

  const sharp = (await import('sharp')).default;

  // An animation re-encoded with `animated: false` comes back as its first
  // frame. Publishing a still of someone's animated logo is not an
  // optimisation, so these are left alone and reported as untouched.
  const probe = await sharp(buffer, { failOn: 'none' }).metadata();
  if ((probe.pages ?? 1) > 1) return null;

  // A null width means "re-encode, do not resize" — the Webflow tab asks for
  // images that have never been measured, and a made-up target width would be
  // worse than leaving the dimensions alone.
  const resized = () => {
    const pipeline = sharp(buffer, { failOn: 'none' });
    return width === null ? pipeline : pipeline.resize({ width, withoutEnlargement: true });
  };

  // AVIF is already better than anything WebP would produce; re-encoding it
  // as WebP would be a downgrade dressed up as a saving.
  if (format === 'avif') {
    return { bytes: await resized().avif({ quality: 70, effort: 5 }).toBuffer(), ext: 'avif', how: 'AVIF q70' };
  }

  const [lossless, visuallyLossless] = await Promise.all([
    resized().webp({ lossless: true, effort: 6 }).toBuffer(),
    resized().webp({ quality: 90, alphaQuality: 100, smartSubsample: true, effort: 6 }).toBuffer(),
  ]);

  const winner =
    lossless.byteLength <= visuallyLossless.byteLength
      ? { bytes: lossless, ext: 'webp', how: 'WebP lossless' }
      : { bytes: visuallyLossless, ext: 'webp', how: 'WebP q90' };

  // Never hand back something heavier than what the site already serves.
  return winner.bytes.byteLength < buffer.byteLength ? winner : null;
}


function safeFileName(src: string): string {
  const raw = decodeURIComponent(src.split('/').pop() || 'image').replace(/^[0-9a-f]{24}_/i, '');
  return raw.replace(/[^\w.-]+/g, '-').slice(0, 80);
}

export interface ImageBudgetResult {
  pagesMeasured: number;
  imagesMeasured: number;
  oversized: number;
  undersized: number;
  estimatedSaving: number;
  actualSaving?: number;
  emitDir?: string;
}

export async function runImageBudget(
  project: Project,
  payload: ImageBudgetPayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<ImageBudgetResult> {
  const pageUrls =
    payload.pages && payload.pages.length > 0
      ? payload.pages
      : (project.links ?? [])
          .filter((link) => link.source === 'auto' && link.url)
          .map((link) => link.url);

  const targets = pageUrls.slice(0, payload.limit ?? 40);
  if (targets.length === 0) {
    return { pagesMeasured: 0, imagesMeasured: 0, oversized: 0, undersized: 0, estimatedSaving: 0 };
  }

  const browser = await launchMeasuringBrowser();
  // One asset can sit on every page of a site; it has to satisfy the widest
  // slot any of them puts it in, so the measurements merge rather than stack.
  const widest = new Map<string, ImageMeasurement & { pages: Set<string> }>();

  try {
    for (const [index, pageUrl] of targets.entries()) {
      await onProgress(`Measuring ${pageUrl}`, index / targets.length);
      try {
        const measurement = await measurePage(browser, pageUrl, { viewports: payload.viewports });
        for (const image of measurement.images) {
          const key = imageFingerprint(image.src);
          const existing = widest.get(key);
          if (!existing) {
            widest.set(key, { ...image, pages: new Set([pageUrl]) });
            continue;
          }
          existing.pages.add(pageUrl);
          if (image.renderedWidth > existing.renderedWidth) {
            existing.renderedWidth = image.renderedWidth;
            existing.widestAt = image.widestAt;
          }
          existing.hasSrcset = existing.hasSrcset || image.hasSrcset;
          existing.hidden = existing.hidden && image.hidden;
        }
      } catch (error) {
        console.error(`[image-budget] ${pageUrl}:`, error);
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  await onProgress(`Reading ${widest.size} image files`, 0.7);
  const withFacts = await attachFileFacts([...widest.values()]);
  const byFingerprint = new Map(withFacts.map((image) => [imageFingerprint(image.src), image]));

  const findings: StoredWeightFinding[] = [];
  let actualSaving = 0;
  const measuredAt = new Date().toISOString();

  const worthResizing = withFacts
    .map(assessImageWeight)
    .filter((assessment) => assessment.verdict === 'oversized' && assessment.worthDoing);

  for (const [key, measurement] of byFingerprint) {
    const assessment = assessImageWeight(measurement);
    const source = widest.get(key);
    findings.push({
      ...assessment,
      fingerprint: key,
      pages: [...(source?.pages ?? [])],
      widestAt: measurement.widestAt,
      isBackground: measurement.isBackground,
      hasSrcset: measurement.hasSrcset,
      format: measurement.format,
      measuredAt,
    });
  }

  // Ask Webflow where each one lives. Without this a finding is just a URL,
  // and the tab cannot tell an image it can repoint from one that will always
  // be a drag into Designer — which is the first thing anyone wants to know.
  const siteId = project.webflowConfig?.siteId;
  if (siteId) {
    await onProgress('Working out which images are fixable', 0.68);
    const token = await getWebflowTokenAdmin(project.id);
    if (token) {
      const placements = await placementsFor(siteId, token, findings.map((finding) => finding.src));
      for (const finding of findings) finding.placement = placements.get(finding.fingerprint) ?? 'unknown';
    }
  }

  // Actually produce the files, so the saving reported is measured rather
  // than a guess from area.
  if (payload.emitDir && worthResizing.length > 0) {
    const dir = path.resolve(payload.emitDir);
    await fs.mkdir(dir, { recursive: true });
    for (const [index, assessment] of worthResizing.entries()) {
      await onProgress(
        `Resizing ${index + 1}/${worthResizing.length}`,
        0.7 + (0.3 * index) / worthResizing.length,
      );
      try {
        const res = await fetch(assessment.src, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) continue;
        const original = Buffer.from(await res.arrayBuffer());
        const key = imageFingerprint(assessment.src);
        const measurement = byFingerprint.get(key);
        const finding = findings.find((item) => item.fingerprint === key);
        const encoded = await encodeAtWidth(original, assessment.targetWidth, measurement?.format ?? '');
        if (!encoded) {
          // Animated, vector, or already smaller than anything we can make.
          // Saying so on the finding stops someone chasing a file that is
          // deliberately absent from the folder.
          if (finding) finding.optimisedHow = 'left alone — nothing smaller without a visible change';
          continue;
        }

        const base = safeFileName(assessment.src).replace(/\.[^.]+$/, '');
        const outPath = path.join(dir, `${base}@${assessment.targetWidth}w.${encoded.ext}`);
        await fs.writeFile(outPath, encoded.bytes);

        if (finding) {
          finding.optimisedBytes = encoded.bytes.byteLength;
          finding.optimisedPath = outPath;
          finding.optimisedHow = encoded.how;
        }
        actualSaving += Math.max(0, original.byteLength - encoded.bytes.byteLength);
      } catch (error) {
        console.error(`[image-budget] could not resize ${assessment.src}:`, error);
      }
    }
  }

  await writeFindings(project.id, findings);

  const summary = summariseWeight(findings);
  return {
    pagesMeasured: targets.length,
    imagesMeasured: summary.measured,
    oversized: summary.oversized,
    undersized: summary.undersized,
    estimatedSaving: summary.estimatedSaving,
    actualSaving: payload.emitDir ? actualSaving : undefined,
    emitDir: payload.emitDir ? path.resolve(payload.emitDir) : undefined,
  };
}

async function writeFindings(projectId: string, findings: StoredWeightFinding[]): Promise<void> {
  const collection = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection(IMAGE_BUDGET);

  // A measurement that no longer applies is worse than no measurement, so the
  // previous run is cleared rather than merged into.
  const existing = await collection.get();
  const replacements = new Map<string, StoredWeightFinding['replacement']>();
  for (const doc of existing.docs) {
    const data = doc.data() as StoredWeightFinding;
    if (data.replacement) replacements.set(data.fingerprint, data.replacement);
  }
  for (const finding of findings) {
    if (!finding.replacement && replacements.has(finding.fingerprint)) {
      finding.replacement = replacements.get(finding.fingerprint);
    }
  }
  for (let i = 0; i < existing.docs.length; i += 400) {
    const batch = adminDb.batch();
    for (const doc of existing.docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }

  for (let i = 0; i < findings.length; i += 400) {
    const batch = adminDb.batch();
    for (const finding of findings.slice(i, i + 400)) {
      const { fingerprint, ...rest } = finding;
      batch.set(
        collection.doc(fingerprint.replace(/[^\w.-]+/g, '_').slice(0, 300)),
        Object.fromEntries(
          Object.entries({ ...rest, fingerprint, updatedAt: AdminTimestamp.now() }).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      );
    }
    await batch.commit();
  }
}

export function describeResult(result: ImageBudgetResult): string {
  const saving = result.actualSaving ?? result.estimatedSaving;
  return (
    `${result.imagesMeasured} images across ${result.pagesMeasured} pages · ` +
    `${result.oversized} oversized, ${result.undersized} too small · ` +
    `${formatBytes(saving)} to save${result.actualSaving !== undefined ? '' : ' (estimated)'}`
  );
}
