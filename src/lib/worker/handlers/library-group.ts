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
import type { CurrentImage } from '@/lib/worker/queue';
import { readImageIndex, recordInIndex, type IndexUpdate } from '@/lib/image-index-admin';

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
  /**
   * Just these images, by URL, rather than the whole group — for when someone
   * has picked rows. Anything not in the group is ignored.
   */
  srcs?: string[];
  /** Which halves to run. Both by default. */
  steps?: { alt?: boolean; images?: boolean };
  /** Redo images the index says are already optimised. Off by default. */
  force?: boolean;
  /** Publish changed CMS items when done. Off by default. */
  publish?: boolean;
  by?: string;
  /**
   * Only images this project has never seen: no ALT draft, nothing in the
   * image index. The hourly look for new images sets it — a person's click
   * also retries held drafts and failed optimisations; an hourly check doing
   * that would re-read the same 250 unsure images 24 times a day.
   */
  newOnly?: boolean;
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
    /** Skipped without downloading — the image index says they are done. */
    alreadyDone: number;
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

interface GroupImage {
  src: string;
  fingerprint: string;
  missingAlt: boolean;
  context: ImageContext;
  /** "Ringg AI · Logo Inline — Dark" — what the navigation bar shows. */
  label: string;
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
  onProgress: (message: string, fraction?: number, current?: CurrentImage | null) => Promise<void> | void,
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
        label: asset.displayName ?? asset.originalFileName ?? 'Site asset',
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
        label: `${entry.itemName} · ${entry.fieldDisplayName}`,
        context: {
          src: entry.imageUrl,
          siteName: project.name,
          // The collection says what kind of thing it is and the item says
          // which one — how a name and a role end up in the alt text.
          // The item's name is who or what this is. The field's name
          // ("Headshot") used to go in as the image's title attribute, and the
          // model duly wrote "Numaan Ashraf, Headshot".
          subject: entry.itemName,
          nearbyText: `An image in the ${entry.collectionName} CMS collection, on the item "${entry.itemName}".`,
        },
      });
    }
  }
  // A selection narrows the group to the rows someone picked.
  if (payload.srcs?.length) {
    const picked = new Set(payload.srcs.map((src) => imageFingerprint(src)));
    for (let i = images.length - 1; i >= 0; i -= 1) if (!picked.has(images[i].fingerprint)) images.splice(i, 1);
  }
  result.images = images.length;
  const labelBySrc = new Map(images.map((image) => [image.src, image.label]));
  const runAlt = payload.steps?.alt !== false;
  const runImages = payload.steps?.images !== false;
  const key = groupKey(group);

  // ── ALT: describe, then write what the classifier is sure of ──────────────
  if (runAlt) try {
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
    // Held drafts are described again. When nothing has changed that is a
    // cache hit and free; when the context or the rules have — as when a CMS
    // item's name started counting as fact — the image gets a fresh answer
    // instead of staying stuck behind the old one.
    const toDraft = missing.filter((image) => {
      const draft = drafts.get(image.fingerprint);
      return !draft || (!payload.newOnly && !isConfident(draft));
    });

    // One image at a time, named before it starts and saved as soon as it is
    // done: the screen lights up the row being read, and its ALT box fills in
    // the moment the draft exists rather than ten images later. A run that
    // dies keeps every image it finished.
    for (const [i, image] of toDraft.entries()) {
      await onProgress(
        `Describing ${i + 1}/${toDraft.length}`,
        0.02 + (i / Math.max(1, toDraft.length)) * 0.6,
        { src: image.src, phase: 'describing', label: image.label },
      );
      const { suggestions, failures } = await generateAltTextBatch([image.context]);
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
        (message, fraction) => onProgress(`ALT · ${message}`, 0.62 + (fraction ?? 0) * 0.08, null),
      );
      result.alt.decorative = confident.filter((image) => drafts.get(image.fingerprint)?.kind === 'decorative').length;
      result.alt.added = Math.max(0, confident.length - applied.skipped.length - result.alt.decorative);
      if (applied.failed.length) result.errors.push(`ALT: ${applied.failed.map((f) => f.error).join('; ')}`);
    }

    // The index records where each image's ALT stands, so the screen can say
    // so per row. Webflow stays the source of truth for whether ALT exists —
    // this is what happened, not what is.
    const at = new Date().toISOString();
    const confidentSet = new Set(confident.map((image) => image.fingerprint));
    const updates: IndexUpdate[] = images.map((image) => {
      const draft = drafts.get(image.fingerprint) as (StoredDraft & { alt?: string }) | undefined;
      const state = !image.missingAlt
        ? 'present'
        : settled.has(image.fingerprint)
          ? 'decorative'
          : confidentSet.has(image.fingerprint)
            ? draft?.kind === 'decorative'
              ? 'decorative'
              : 'added'
            : draft
              ? 'held'
              : undefined;
      return {
        fingerprint: image.fingerprint,
        src: image.src,
        group: key,
        ...(state ? { alt: { state, text: state === 'added' ? draft?.alt : undefined, at } } : {}),
      };
    });
    await recordInIndex(projectId, updates);
  } catch (error) {
    result.errors.push(`ALT: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── images: optimise in place where Webflow allows it ─────────────────────
  // After ALT, not before: the apply step reads each field fresh, so the swap
  // carries the alt text that was just written rather than blanking it.
  if (runImages) try {
    let srcs = images.map((image) => image.src);
    let alreadyDone = 0;
    if (payload.newOnly) {
      const index = await readImageIndex(projectId);
      srcs = images.filter((image) => !index.get(image.fingerprint)?.optimise).map((image) => image.src);
      alreadyDone = images.length - srcs.length;
    }
    // Nothing new in this group: no need to read its fields again.
    const applied = srcs.length === 0 ? null : await runImageApply(
      projectId,
      {
        srcs,
        collectionIds: group.kind === 'collection' ? [group.collectionId] : [],
        designerCopies: group.kind === 'assets',
        publish: payload.publish,
        by: payload.by,
        group: key,
        force: payload.force,
      },
      (message, fraction, current) =>
        onProgress(
          `Images · ${message}`,
          0.7 + (fraction ?? 0) * 0.3,
          current ? { ...current, label: labelBySrc.get(current.src) } : current,
        ),
    );
    const unchanged = applied?.skipped.filter((skip) => /small|smaller|not a CMS image/.test(skip.reason)).length ?? 0;
    result.optimise = {
      alreadyDone: alreadyDone + (applied?.alreadyDone ?? 0),
      optimised: applied?.uploaded ?? 0,
      resized: applied?.resized ?? 0,
      designerCopies: applied ? applied.preparedForDesigner + applied.alreadyPrepared : 0,
      bytesSaved: applied?.bytesSaved ?? 0,
      unchanged,
      failed: applied?.failed.length ?? 0,
    };
    if (applied?.failed.length) {
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
