import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getCollection, listCollections, listItems, patchItems, publishItems } from '@/lib/cms/webflow-client';
import { extractAllImages } from '@/lib/cms/extract';
import { groupUpdatesByItem } from '@/lib/cms/patch';
import { decisionId, imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { resolveAssets, type WebflowAssetSummary } from '@/modules/site-monitoring/domain/webflow-assets';
import { getWebflowTokenAdmin, loadProjectDocAdmin } from '@/lib/project-admin';
import type { CmsImageEntry, CmsUpdatePayload } from '@/types/webflow';

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

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export interface AltApplyPayload {
  /** Which suggestions to write. Required — this never applies everything by itself. */
  fingerprints: string[];
  /** Publish the changed CMS items afterwards. Off by default. */
  publish?: boolean;
  by?: string;
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

/** Every CMS image on the site, keyed by image fingerprint. */
async function buildCmsIndex(
  siteId: string,
  token: string,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<Map<string, CmsImageEntry>> {
  const index = new Map<string, CmsImageEntry>();
  const collections = await listCollections(siteId, token);

  for (const [i, collection] of collections.entries()) {
    await onProgress(`Reading collection ${collection.displayName ?? collection.slug}`, 0.1 + (i / collections.length) * 0.4);
    const full = (await getCollection(collection.id, token)) as unknown as { fields?: unknown[] };
    const fields = (full.fields ?? []) as never[];

    let offset = 0;
    for (;;) {
      const { items, pagination } = await listItems(collection.id, token, offset, 100);
      for (const item of items) {
        for (const entry of extractAllImages(
          item as never,
          collection.id,
          collection.displayName ?? collection.slug,
          fields,
        )) {
          const key = imageFingerprint(entry.imageUrl);
          // First one wins; the same asset reused across items is written once.
          if (key && !index.has(key)) index.set(key, entry);
        }
      }
      offset += items.length;
      if (items.length === 0 || offset >= (pagination.total ?? offset)) break;
    }
  }

  return index;
}

async function listSiteAssets(siteId: string, token: string): Promise<WebflowAssetSummary[]> {
  const assets: WebflowAssetSummary[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const res = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/assets?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) break;
    const page = (await res.json()) as { assets?: WebflowAssetSummary[]; pagination?: { total?: number } };
    assets.push(...(page.assets ?? []));
    if ((page.assets?.length ?? 0) < 100 || assets.length >= (page.pagination?.total ?? assets.length)) break;
  }
  return assets;
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

  const suggestions = suggestionDocs.docs
    .map((doc) => doc.data() as StoredSuggestion)
    .filter((s) => wanted.has(s.fingerprint));

  const cmsIndex = await buildCmsIndex(siteId, token, onProgress);
  await onProgress('Reading site assets', 0.55);
  const assets = await listSiteAssets(siteId, token);
  const assetBySrc = resolveAssets(suggestions.map((s) => s.src), assets);

  // ── CMS: group by item so one PATCH carries every field on it ────────────
  const updates: CmsUpdatePayload[] = [];
  const assetWrites: { fingerprint: string; assetId: string; alt: string }[] = [];

  for (const suggestion of suggestions) {
    // A decorative image is written as an empty alt on purpose; anything else
    // with no text has nothing to say and is left alone.
    if (!suggestion.alt && suggestion.kind !== 'decorative') {
      result.skipped.push({ fingerprint: suggestion.fingerprint, reason: 'no alt text drafted' });
      continue;
    }

    const entry = cmsIndex.get(suggestion.fingerprint);
    if (entry) {
      updates.push({
        collectionId: entry.collectionId,
        itemId: entry.itemId,
        fieldSlug: entry.fieldSlug,
        fieldType: entry.fieldType,
        imageIndex: entry.imageIndex,
        newAlt: suggestion.alt,
        rawFieldValue: entry.rawFieldValue,
      });
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

    for (const update of updates) applied.add(imageFingerprintOfUpdate(update, cmsIndex));

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
    const res = await fetch(`${WEBFLOW_API_BASE}/assets/${write.assetId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
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

/** The fingerprint an update came from, so the decision lands on the right row. */
function imageFingerprintOfUpdate(update: CmsUpdatePayload, index: Map<string, CmsImageEntry>): string {
  for (const [fingerprint, entry] of index) {
    if (
      entry.collectionId === update.collectionId &&
      entry.itemId === update.itemId &&
      entry.fieldSlug === update.fieldSlug &&
      entry.imageIndex === update.imageIndex
    ) {
      return fingerprint;
    }
  }
  return '';
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
