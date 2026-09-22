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
  format: string;
  measuredAt: string;
}

/** Keep the source format when it is already modern; otherwise WebP. */
function targetFormat(format: string): 'webp' | 'avif' | 'jpeg' | 'png' {
  if (format === 'avif') return 'avif';
  if (format === 'png') return 'png';
  return 'webp';
}

async function encodeAtWidth(
  buffer: Buffer,
  width: number,
  format: string,
): Promise<{ bytes: Buffer; ext: string }> {
  const sharp = (await import('sharp')).default;
  const pipeline = sharp(buffer, { failOn: 'none', animated: false }).resize({
    width,
    withoutEnlargement: true,
  });
  const chosen = targetFormat(format);
  if (chosen === 'avif') return { bytes: await pipeline.avif({ quality: 55 }).toBuffer(), ext: 'avif' };
  if (chosen === 'png') return { bytes: await pipeline.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' };
  return { bytes: await pipeline.webp({ quality: 82 }).toBuffer(), ext: 'webp' };
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
        const { bytes, ext } = await encodeAtWidth(original, assessment.targetWidth, measurement?.format ?? '');
        const base = safeFileName(assessment.src).replace(/\.[^.]+$/, '');
        const outPath = path.join(dir, `${base}@${assessment.targetWidth}w.${ext}`);
        await fs.writeFile(outPath, bytes);

        const finding = findings.find((item) => item.fingerprint === key);
        if (finding) {
          finding.optimisedBytes = bytes.byteLength;
          finding.optimisedPath = outPath;
        }
        actualSaving += Math.max(0, original.byteLength - bytes.byteLength);
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
