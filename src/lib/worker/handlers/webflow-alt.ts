import { listCollections } from '@/lib/cms/webflow-client';
import { listCollectionImages, listSiteAssets } from '@/lib/cms/library';
import { generateAltTextBatch, type GenerateOptions, type ImageContext } from '@/lib/alt-text';
import { saveAltSuggestions } from '@/lib/alt-suggestions-admin';
import { getWebflowTokenAdmin, loadProjectDocAdmin } from '@/lib/project-admin';

/**
 * Draft alt text for everything in a site's Webflow library.
 *
 * The Audit tab asks "what do visitors hit that has no alt". This asks "what
 * is in the library", which is a different and also useful question — an
 * image about to be placed, or one on a page nobody has scanned, still wants
 * describing. Two questions, two views, one classifier and one draft store,
 * so a draft made from either side shows up on both.
 *
 * It replaces a generation path that called Ollama on `localhost` from a
 * Vercel function. There is no Ollama on Vercel, so that button never worked
 * in production. Running it here also means the fallback is automatic: any
 * machine running the worker picks the job up, Goliath or a laptop.
 */


export interface WebflowAltPayload extends GenerateOptions {
  /** Only images with no alt (the default), or everything. */
  scope?: 'missing' | 'all';
  /** Just these image URLs. Set when someone has picked rows rather than a whole library. */
  srcs?: string[];
  /** Assets, CMS images, or both. */
  sources?: ('assets' | 'cms')[];
  limit?: number;
  concurrency?: number;
}

export interface WebflowAltResult {
  siteName?: string;
  assetsSeen: number;
  cmsSeen: number;
  /** Files in the library that are not images — PDFs, videos — and have no alt to write. */
  notImages: number;
  drafted: number;
  decorative: number;
  needsReview: number;
  failed: number;
  /** Why, for the first few. A bare count sends someone hunting through logs. */
  failures: { src: string; error: string }[];
  saved: number;
}

/** Webflow marks an inherited-but-unset alt with this sentinel. */
const BLANK_ALTS = new Set(['', '__wf_reserved_inherit']);
const hasAlt = (value: string | null | undefined) => !BLANK_ALTS.has((value ?? '').trim());

/**
 * A Webflow asset library holds files, not images: PDFs, videos, fonts. They
 * have no alt text and are not pictures, so feeding them to a vision model
 * fails on every one — which is exactly what happened on Canopy, where three
 * of the seven "missing alt" assets were two PDFs and an MP4.
 */
const isImage = (contentType: string | undefined) =>
  !!contentType && contentType.startsWith('image/');

export async function runWebflowAlt(
  projectId: string,
  payload: WebflowAltPayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<WebflowAltResult> {
  const project = await loadProjectDocAdmin(projectId);
  const siteId = project?.webflowConfig?.siteId;
  if (!siteId) throw new Error('This project has no Webflow site configured');
  const token = await getWebflowTokenAdmin(projectId);
  if (!token) throw new Error('This project has no Webflow API token configured');

  const sources = payload.sources ?? ['assets', 'cms'];
  let notImages = 0;
  // A named selection is the answer to "which ones". The missing/all filter
  // applies within it only when the caller asked for one — a selection with
  // no scope means "these, whatever their state", which is what the Draft
  // Selected button has always meant. The one-shot Optimise passes 'missing'
  // so it does not spend ten seconds of GPU re-describing an image that
  // already has good alt text.
  const chosen = payload.srcs?.length ? new Set(payload.srcs) : null;
  const wantAll = payload.scope === 'all' || (!!chosen && payload.scope === undefined);
  const contexts: ImageContext[] = [];
  let assetsSeen = 0;
  let cmsSeen = 0;

  if (sources.includes('assets')) {
    await onProgress('Reading the asset library', 0.05);
    const assets = await listSiteAssets(siteId, token);
    assetsSeen = assets.length;
    for (const asset of assets) {
      if (!asset.hostedUrl) continue;
      if (!isImage(asset.contentType)) {
        notImages += 1;
        continue;
      }
      if (!wantAll && hasAlt(asset.altText)) continue;
      contexts.push({
        src: asset.hostedUrl,
        siteName: project.name,
        // A library image has no page around it, so the file name and folder
        // are the only context there is. The classifier is told as much
        // rather than being left to invent something.
        title: asset.displayName ?? asset.originalFileName,
        nearbyText: `A file in the ${project.name} Webflow asset library. There is no page context for it.`,
      });
    }
  }

  if (sources.includes('cms')) {
    await onProgress('Reading the CMS collections', 0.15);
    const collections = await listCollections(siteId, token);
    for (const [i, collection] of collections.entries()) {
      await onProgress(
        `Reading ${collection.displayName ?? collection.slug}`,
        0.15 + (i / Math.max(1, collections.length)) * 0.2,
      );
      for (const entry of await listCollectionImages(collection.id, token)) {
        cmsSeen += 1;
        if (!wantAll && !entry.isMissingAlt) continue;
        contexts.push({
          src: entry.imageUrl,
          siteName: project.name,
          heading: entry.itemName,
          title: entry.fieldDisplayName,
          nearbyText: `${entry.collectionName}: ${entry.itemName} — the "${entry.fieldDisplayName}" field.`,
        });
      }
    }
  }

  // The same asset can be both a library entry and a CMS field value.
  const seen = new Set<string>();
  const targets = contexts
    .filter((context) => !chosen || chosen.has(context.src))
    .filter((context) => (seen.has(context.src) ? false : (seen.add(context.src), true)))
    .slice(0, payload.limit ?? 300);

  await onProgress(`Describing ${targets.length} images`, 0.35);
  const { suggestions, failures } = await generateAltTextBatch(targets, {
    ...payload,
    onProgress: ({ done, total }) => {
      void onProgress(`Describing ${done}/${total}`, 0.35 + (done / Math.max(1, total)) * 0.6);
    },
  });

  const saved = await saveAltSuggestions(projectId, suggestions);

  return {
    siteName: project.name,
    assetsSeen,
    cmsSeen,
    notImages,
    drafted: suggestions.filter((s) => s.kind !== 'decorative').length,
    decorative: suggestions.filter((s) => s.kind === 'decorative').length,
    needsReview: suggestions.filter((s) => s.needsReview).length,
    failed: failures.length,
    failures: failures.slice(0, 10).map((f) => ({ src: f.context.src, error: f.error })),
    saved,
  };
}
