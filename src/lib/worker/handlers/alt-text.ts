import { extractImageContexts, fetchPage, generateAltTextBatch, type GenerateOptions, type ImageContext } from '@/lib/alt-text';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { loadProjectForAltText, saveAltSuggestions } from '@/lib/alt-suggestions-admin';

/**
 * Draft alt text for everything a project's audit says is missing it.
 *
 * The audit knows *which* images have no alt; only the page knows what they
 * mean, so the pages are re-read for context before anything is generated.
 * One asset shared by three hundred CMS pages is described once — that is the
 * same roll-up the Audit tab shows, and it is the difference between a
 * ten-minute run and an overnight one.
 *
 * Shared by the worker and the `npm run alt project` command so the two
 * cannot drift.
 */

export interface AltTextPayload extends GenerateOptions {
  /** Stop after this many pages of the project. */
  pageLimit?: number;
  concurrency?: number;
  /** Generate but do not save. */
  dryRun?: boolean;
}

export interface AltTextRunResult {
  projectName: string;
  openFindings: number;
  described: number;
  needsReview: number;
  decorative: number;
  failed: number;
  saved: number;
}

export async function runAltTextForProject(
  projectId: string,
  payload: AltTextPayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<AltTextRunResult> {
  const project = await loadProjectForAltText(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const pages = project.pagesWithMissingAlt.slice(0, payload.pageLimit ?? 40);
  await onProgress(`Reading ${pages.length} pages for context`, 0);

  const byFingerprint = new Map<string, ImageContext & { pageCount: number }>();
  for (const [index, page] of pages.entries()) {
    await onProgress(`Reading ${page.url}`, (index / Math.max(1, pages.length)) * 0.2);
    try {
      const html = await fetchPage(page.url);
      for (const image of extractImageContexts(html, page.url, { siteName: project.name })) {
        const key = imageFingerprint(image.src);
        if (!project.wantedFingerprints.has(key)) continue;
        const existing = byFingerprint.get(key);
        if (existing) existing.pageCount += 1;
        else byFingerprint.set(key, { ...image, pageCount: 1 });
      }
    } catch (error) {
      console.error(`[alt-text] could not read ${page.url}:`, error);
    }
  }

  // Most-shared first: one template image clears the most rows soonest.
  const contexts = [...byFingerprint.values()].sort((a, b) => (b.pageCount ?? 1) - (a.pageCount ?? 1));

  const { suggestions, failures } = await generateAltTextBatch(contexts, {
    ...payload,
    onProgress: ({ done, total }) => {
      void onProgress(`Describing ${done}/${total}`, 0.2 + (done / Math.max(1, total)) * 0.8);
    },
  });

  const saved = payload.dryRun ? 0 : await saveAltSuggestions(projectId, suggestions);

  return {
    projectName: project.name,
    openFindings: project.openFindings,
    described: suggestions.filter((s) => s.kind !== 'decorative').length,
    needsReview: suggestions.filter((s) => s.needsReview).length,
    decorative: suggestions.filter((s) => s.kind === 'decorative').length,
    failed: failures.length,
    saved,
  };
}
