import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { generateAltTextBatch, type ImageContext } from '@/lib/alt-text';
import { saveAltSuggestions } from '@/lib/alt-suggestions-admin';
import { buildCmsIndex, listCollectionImages, listSiteAssets } from '@/lib/cms/library';
import { getWebflowTokenAdmin, loadProjectDocAdmin } from '@/lib/project-admin';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { cmsSourceAssetIds } from '@/modules/site-monitoring/domain/webflow-assets';
import { runAltApply } from './alt-apply';
import { runImageApply } from './image-apply';

/**
 * One click for one group of a site's images: ALT text and optimisation.
 *
 * A group is the site's general assets, or one CMS collection. The Images
 * screen queues one of these per group — "Optimise everything" queues them
 * all — so each section of the screen has its own progress, its own result,
 * and its own failure. A rate limit in "Companies" no longer takes "Teams"
 * down with it, which is how the first one-click run on PeakXV ended.
 *
 * ALT: every image missing it is described, saved ten at a time so a run that
 * dies three hours in keeps three hours of work, and the confident ones are
 * written to Webflow. Drafts the classifier flags as unsure are held for a
 * person — Rehan's call, 2026-09-22: one click should add ALT, but not text
 * the model itself doubts.
 *
 * Images: CMS images are re-encoded (resized too, where the Weight tab has
 * measured them), backed up to Bunny, and repointed. Site assets cannot be
 * swapped through Webflow's API, so the measured-oversized ones get an
 * optimised copy in the "ActiveSet · optimised" folder, to pick in Designer.
 */

export type LibraryGroup =
  | { kind: 'assets' }
  | { kind: 'collection'; collectionId: string; name?: string };

export interface LibraryGroupPayload {
  group: LibraryGroup;
  /** Publish changed CMS items when done. Off by default. */
  publish?: boolean;
  by?: string;
}

export interface LibraryGroupResult {
  group: string;
  images: number;
  alt: {
    missing: number;
    drafted: number;
    added: number;
    decorative: number;
    held: number;
    failed: number;
  };
  optimise?: {
    optimised: number;
    resized: number;
    designerCopies: number;
    bytesSaved: number;
    unchanged: number;
    failed: number;
  };
  /** What went wrong, per half, when a half did not finish. */
  errors: string[];
}

/** Webflow marks an inherited-but-unset alt with this sentinel. */
const BLANK_ALTS = new Set(['', '__wf_reserved_inherit']);
const DRAFT_CHUNK = 10;

interface GroupImage {
  src: string;
  fingerprint: string;
  missingAlt: boolean;
  context: ImageContext;
}

interface StoredDraft {
  fingerprint: string;
  kind?: string;
  certainty?: string;
  needsReview?: boolean;
}

/** A draft the classifier stands behind. Everything else waits for a person. */
export const isConfident = (draft: StoredDraft) => !draft.needsReview && draft.certainty !== 'low';

export const groupKey = (group: LibraryGroup) => (group.kind === 'assets' ? 'assets' : group.collectionId);

export async function runLibraryGroup(
  projectId: string,
  payload: LibraryGroupPayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<LibraryGroupResult> {
  const project = await loadProjectDocAdmin(projectId);
  const siteId = project?.webflowConfig?.siteId;
  if (!siteId) throw new Error('This project has no Webflow site configured');
  const token = await getWebflowTokenAdmin(projectId);
  if (!token) throw new Error('This project has no Webflow API token configured');

  const { group } = payload;
  const result: LibraryGroupResult = {
    group: groupKey(group),
    images: 0,
    alt: { missing: 0, drafted: 0, added: 0, decorative: 0, held: 0, failed: 0 },
    errors: [],
  };

  // ── what is in this group ──────────────────────────────────────────────────
  await onProgress('Reading the images', 0.01);
  const images: GroupImage[] = [];
  if (group.kind === 'assets') {
    // General assets are the ones no CMS image was made from. The rest are
    // uploads Webflow copied into a collection; their alt lives on the CMS
    // field and their asset-level alt is never shown, so the collection runs
    // handle them. On PeakXV that is 1,236 of 1,993.
    const cmsIndex = await buildCmsIndex(siteId, token, {
      onProgress: (message) => onProgress(`Checking which assets are CMS uploads · ${message}`, 0.01),
    });
    const sources = cmsSourceAssetIds([...cmsIndex.values()].map((entries) => entries[0].imageUrl));
    for (const asset of await listSiteAssets(siteId, token)) {
      // A library holds PDFs, videos and fonts too; they are not pictures.
      if (!asset.hostedUrl || !asset.contentType?.startsWith('image/')) continue;
      if (sources.has(asset.id.toLowerCase())) continue;
      images.push({
        src: asset.hostedUrl,
        fingerprint: imageFingerprint(asset.hostedUrl),
        missingAlt: BLANK_ALTS.has((asset.altText ?? '').trim()),
        context: {
          src: asset.hostedUrl,
          siteName: project.name,
          title: asset.displayName ?? asset.originalFileName,
          nearbyText: `A file in the ${project.name} Webflow asset library. There is no page context for it.`,
        },
      });
    }
  } else {
    const seen = new Set<string>();
    for (const entry of await listCollectionImages(group.collectionId, token)) {
      const fingerprint = imageFingerprint(entry.imageUrl);
      // One image in many fields is one image to describe and one to optimise;
      // the apply steps write it to every field that uses it.
      if (seen.has(fingerprint)) {
        if (entry.isMissingAlt) images.find((image) => image.fingerprint === fingerprint)!.missingAlt = true;
        continue;
      }
      seen.add(fingerprint);
      images.push({
        src: entry.imageUrl,
        fingerprint,
        missingAlt: entry.isMissingAlt,
        context: {
          src: entry.imageUrl,
          siteName: project.name,
          // The collection says what kind of thing it is and the item says
          // which one — how a name and a role end up in the alt text.
          heading: entry.itemName,
          title: entry.fieldDisplayName,
          nearbyText: `${entry.collectionName}: ${entry.itemName} — the "${entry.fieldDisplayName}" field.`,
        },
      });
    }
  }
  result.images = images.length;

  // ── ALT: describe, then write what the classifier is sure of ──────────────
  try {
    const project$ = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
    const drafts = new Map<string, StoredDraft>();
    for (const doc of (await project$.collection('alt_suggestions').get()).docs) {
      const draft = doc.data() as StoredDraft;
      drafts.set(draft.fingerprint, draft);
    }
    // Images already settled as decorative stay empty on purpose; to Webflow
    // they look missing forever, so without this they are redone every run.
    const settled = new Set<string>();
    for (const doc of (await project$.collection('audit_decisions').where('decision', '==', 'decorative').get()).docs) {
      settled.add((doc.data() as { fingerprint: string }).fingerprint);
    }

    const missing = images.filter((image) => image.missingAlt && !settled.has(image.fingerprint));
    result.alt.missing = missing.length;
    const toDraft = missing.filter((image) => !drafts.has(image.fingerprint));

    for (let i = 0; i < toDraft.length; i += DRAFT_CHUNK) {
      const chunk = toDraft.slice(i, i + DRAFT_CHUNK);
      const { suggestions, failures } = await generateAltTextBatch(
        chunk.map((image) => image.context),
        {
          onProgress: ({ done }) => {
            void onProgress(
              `Describing ${i + done}/${toDraft.length}`,
              0.02 + ((i + done) / Math.max(1, toDraft.length)) * 0.6,
            );
          },
        },
      );
      await saveAltSuggestions(projectId, suggestions);
      for (const suggestion of suggestions) drafts.set(suggestion.fingerprint, suggestion);
      result.alt.drafted += suggestions.length;
      result.alt.failed += failures.length;
    }

    const confident = missing.filter((image) => {
      const draft = drafts.get(image.fingerprint);
      return draft && isConfident(draft);
    });
    result.alt.held = missing.filter((image) => {
      const draft = drafts.get(image.fingerprint);
      return draft && !isConfident(draft);
    }).length;

    if (confident.length > 0) {
      const applied = await runAltApply(
        projectId,
        {
          fingerprints: confident.map((image) => image.fingerprint),
          publish: payload.publish,
          by: payload.by,
          collectionIds: group.kind === 'collection' ? [group.collectionId] : [],
          includeAssets: group.kind === 'assets',
        },
        (message, fraction) => onProgress(`ALT · ${message}`, 0.62 + (fraction ?? 0) * 0.08),
      );
      result.alt.decorative = confident.filter((image) => drafts.get(image.fingerprint)?.kind === 'decorative').length;
      result.alt.added = Math.max(0, confident.length - applied.skipped.length - result.alt.decorative);
      if (applied.failed.length) result.errors.push(`ALT: ${applied.failed.map((f) => f.error).join('; ')}`);
    }
  } catch (error) {
    result.errors.push(`ALT: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── images: optimise in place where Webflow allows it ─────────────────────
  // After ALT, not before: the apply step reads each field fresh, so the swap
  // carries the alt text that was just written rather than blanking it.
  try {
    const applied = await runImageApply(
      projectId,
      {
        srcs: images.map((image) => image.src),
        collectionIds: group.kind === 'collection' ? [group.collectionId] : [],
        designerCopies: group.kind === 'assets',
        publish: payload.publish,
        by: payload.by,
      },
      (message, fraction) => onProgress(`Images · ${message}`, 0.7 + (fraction ?? 0) * 0.3),
    );
    const unchanged = applied.skipped.filter((skip) => /small|smaller|not a CMS image/.test(skip.reason)).length;
    result.optimise = {
      optimised: applied.uploaded,
      resized: applied.resized,
      designerCopies: applied.preparedForDesigner + applied.alreadyPrepared,
      bytesSaved: applied.bytesSaved,
      unchanged,
      failed: applied.failed.length,
    };
    if (applied.failed.length) {
      result.errors.push(`Images: ${applied.failed.slice(0, 3).map((f) => f.error).join('; ')}`);
    }
  } catch (error) {
    result.errors.push(`Images: ${error instanceof Error ? error.message : String(error)}`);
  }

  // A run where neither half did anything useful is a failed run, and should
  // look like one in the app rather than a green tick over two error lines.
  if (!result.optimise && result.alt.drafted === 0 && result.alt.added === 0 && result.errors.length > 0) {
    throw new Error(result.errors.join(' · '));
  }
  return result;
}
