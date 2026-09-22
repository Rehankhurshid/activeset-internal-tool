import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { patchItems, publishItems, webflowFetch } from '@/lib/cms/webflow-client';
import { buildCmsIndex, listSiteAssets } from '@/lib/cms/library';
import { groupUpdatesByItem } from '@/lib/cms/patch';
import { decisionId } from '@/modules/site-monitoring/domain/audit-findings';
import { resolveAssets } from '@/modules/site-monitoring/domain/webflow-assets';
import { getWebflowTokenAdmin, loadProjectDocAdmin } from '@/lib/project-admin';
import type { CmsUpdatePayload } from '@/types/webflow';

/**
 * Write drafted alt text back to Webflow, in bulk.
 *
 * Doing this one row at a time is unusable at the sizes that matter — a CMS
 * site can have three hundred undescribed images and no one is clicking three
 * hundred times.
 *
 * Two destinations, because Webflow has two. A **site asset** takes its alt
 * through the Assets API. A **CMS image** does not appear in the asset list at
 * all and its alt lives on the collection item's field, which is where nearly
 * all of them turn out to be: on Canopy, eleven of eleven. The asset path
 * alone would have applied nothing.
 *
 * Nothing here decides *what* to write. The caller names the fingerprints, so
 * the person reviewing stays the one choosing.
 */


export interface AltApplyPayload {
  /** Which suggestions to write. Required — this never applies everything by itself. */
  fingerprints: string[];
  /** Publish the changed CMS items afterwards. Off by default. */
  publish?: boolean;
  by?: string;
  /**
   * Text a reviewer typed over a draft, or wrote for an image that was never
   * drafted. Wins over the store. This is how an edit made in the app reaches
   * Webflow through the same door as everything else, instead of a second
   * save path that writes from the browser.
   */
  overrides?: { fingerprint: string; src: string; alt: string }[];
  /**
   * Which CMS collections to look in. Undefined means all; an empty list means
   * none, for a run that only concerns site assets. A per-collection run that
   * re-read every collection on the site was most of what hit the rate limit.
   */
  collectionIds?: string[];
  /** Whether to look for site assets at all. On by default. */
  includeAssets?: boolean;
}

export interface AltApplyResult {
  requested: number;
  appliedToCms: number;
  appliedToAssets: number;
  published: number;
  skipped: { fingerprint: string; reason: string }[];
  failed: { where: string; error: string }[];
}

interface StoredSuggestion {
  fingerprint: string;
  src: string;
  alt: string;
  kind: string;
}

export async function runAltApply(
  projectId: string,
  payload: AltApplyPayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<AltApplyResult> {
  const result: AltApplyResult = {
    requested: payload.fingerprints?.length ?? 0,
    appliedToCms: 0,
    appliedToAssets: 0,
    published: 0,
    skipped: [],
    failed: [],
  };
  if (result.requested === 0) return result;

  const project = await loadProjectDocAdmin(projectId);
  const siteId = project?.webflowConfig?.siteId;
  if (!siteId) throw new Error('This project has no Webflow site configured');
  const token = await getWebflowTokenAdmin(projectId);
  if (!token) throw new Error('This project has no Webflow API token configured');

  await onProgress('Loading the drafts', 0.02);
  const wanted = new Set(payload.fingerprints);
  const suggestionDocs = await adminDb
    .collection(COLLECTIONS.PROJECTS)
    .doc(projectId)
    .collection('alt_suggestions')
    .get();

  const byFingerprint = new Map<string, StoredSuggestion>();
  for (const doc of suggestionDocs.docs) {
    const stored = doc.data() as StoredSuggestion;
    if (wanted.has(stored.fingerprint)) byFingerprint.set(stored.fingerprint, stored);
  }
  // What a reviewer typed wins over what the model drafted, and an image that
  // was never drafted can still be given alt text by hand. An empty override
  // is a deliberate "decorative", not a missing value.
  for (const override of payload.overrides ?? []) {
    if (!wanted.has(override.fingerprint)) continue;
    const existing = byFingerprint.get(override.fingerprint);
    const alt = override.alt.trim();
    byFingerprint.set(override.fingerprint, {
      fingerprint: override.fingerprint,
      src: existing?.src ?? override.src,
      alt,
      kind: alt ? (existing && existing.kind !== 'decorative' ? existing.kind : 'informative') : 'decorative',
    });
  }
  const suggestions = [...byFingerprint.values()];

  const cmsIndex = await buildCmsIndex(siteId, token, {
    collectionIds: payload.collectionIds,
    onProgress: (message, fraction) => onProgress(message, 0.1 + (fraction ?? 0) * 0.4),
  });
  const assetBySrc =
    payload.includeAssets === false
      ? {}
      : (await onProgress('Reading site assets', 0.55),
        resolveAssets(suggestions.map((s) => s.src), await listSiteAssets(siteId, token)));

  // ── CMS: group by item so one PATCH carries every field on it ────────────
  const updates: CmsUpdatePayload[] = [];
  /** Parallel to `updates`, so a decision lands on the image it was written for. */
  const updateFingerprints: string[] = [];
  const assetWrites: { fingerprint: string; assetId: string; alt: string }[] = [];

  for (const suggestion of suggestions) {
    // A decorative image is written as an empty alt on purpose; anything else
    // with no text has nothing to say and is left alone.
    if (!suggestion.alt && suggestion.kind !== 'decorative') {
      result.skipped.push({ fingerprint: suggestion.fingerprint, reason: 'no alt text drafted' });
      continue;
    }

    // Every field that uses this image. An image reused across five items is
    // missing alt in five places; writing only the first left the other four
    // counting as "missing" on the next pass, forever.
    const entries = cmsIndex.get(suggestion.fingerprint);
    if (entries?.length) {
      for (const entry of entries) {
        updates.push({
          collectionId: entry.collectionId,
          itemId: entry.itemId,
          fieldSlug: entry.fieldSlug,
          fieldType: entry.fieldType,
          imageIndex: entry.imageIndex,
          newAlt: suggestion.alt,
          rawFieldValue: entry.rawFieldValue,
        });
        updateFingerprints.push(suggestion.fingerprint);
      }
      continue;
    }

    const assetId = assetBySrc[suggestion.src];
    if (assetId) {
      assetWrites.push({ fingerprint: suggestion.fingerprint, assetId, alt: suggestion.alt });
      continue;
    }

    result.skipped.push({
      fingerprint: suggestion.fingerprint,
      reason: 'not a CMS image or a site asset — set it where the image lives',
    });
  }

  const applied = new Set<string>();

  if (updates.length > 0) {
    await onProgress(`Writing ${updates.length} CMS fields`, 0.6);
    const grouped = groupUpdatesByItem(updates);
    const byCollection = new Map<string, { id: string; fieldData: Record<string, unknown> }[]>();
    for (const entry of grouped.values()) {
      const items = byCollection.get(entry.collectionId) ?? [];
      items.push({ id: entry.itemId, fieldData: entry.fieldData });
      byCollection.set(entry.collectionId, items);
    }

    const publishable = new Map<string, string[]>();
    for (const [collectionId, items] of byCollection) {
      // Webflow caps a bulk PATCH; chunking also keeps one bad item from
      // taking the whole collection down with it.
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const res = await patchItems(collectionId, token, chunk);
        if (res.ok) {
          result.appliedToCms += chunk.length;
          publishable.set(collectionId, [...(publishable.get(collectionId) ?? []), ...chunk.map((c) => c.id)]);
        } else {
          result.failed.push({ where: `collection ${collectionId}`, error: `${res.status}: ${res.text.slice(0, 160)}` });
        }
      }
    }

    for (const fingerprint of updateFingerprints) applied.add(fingerprint);

    if (payload.publish) {
      for (const [collectionId, itemIds] of publishable) {
        await onProgress(`Publishing ${itemIds.length} items`, 0.9);
        const res = await publishItems(collectionId, token, itemIds);
        if (res.ok) result.published += itemIds.length;
        else result.failed.push({ where: `publish ${collectionId}`, error: `${res.status}: ${res.text.slice(0, 160)}` });
      }
    }
  }

  for (const [i, write] of assetWrites.entries()) {
    await onProgress(`Writing asset ${i + 1}/${assetWrites.length}`, 0.85);
    const res = await webflowFetch(`/assets/${write.assetId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ altText: write.alt }),
    });
    if (res.ok) {
      result.appliedToAssets += 1;
      applied.add(write.fingerprint);
    } else {
      result.failed.push({ where: `asset ${write.assetId}`, error: `${res.status}` });
    }
  }

  await recordApplied(projectId, suggestions, applied, payload.by ?? 'worker');
  return result;
}

/**
 * Mark what was written as fixed-but-unverified, which is the same state the
 * single-row Save produces, so a later rescan confirms or regresses it
 * through the existing path rather than a second one.
 */
async function recordApplied(
  projectId: string,
  suggestions: StoredSuggestion[],
  applied: Set<string>,
  by: string,
): Promise<void> {
  const collection = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection('audit_decisions');
  const now = new Date().toISOString();
  const writes = suggestions.filter((s) => applied.has(s.fingerprint));

  for (let i = 0; i < writes.length; i += 400) {
    const batch = adminDb.batch();
    for (const suggestion of writes.slice(i, i + 400)) {
      const id = decisionId('alt', suggestion.fingerprint);
      batch.set(collection.doc(id), {
        kind: 'alt',
        fingerprint: suggestion.fingerprint,
        decision: suggestion.kind === 'decorative' ? 'decorative' : 'fixed_unverified',
        altText: suggestion.alt || undefined,
        by,
        at: now,
        updatedAt: AdminTimestamp.now(),
      });
    }
    await batch.commit();
  }
}
