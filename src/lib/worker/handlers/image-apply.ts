import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getCollection, listCollections, listItems, patchItems, publishItems } from '@/lib/cms/webflow-client';
import { extractAllImages } from '@/lib/cms/extract';
import { groupUpdatesByItem } from '@/lib/cms/patch';
import { uploadAssetToWebflow } from '@/lib/cms/assets';
import { decisionId, fileNameOf, imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { getWebflowTokenAdmin, loadProjectDocAdmin } from '@/lib/project-admin';
import type { CmsImageEntry, CmsUpdatePayload } from '@/types/webflow';
import { encodeAtWidth, type StoredWeightFinding } from './image-budget';
import { backupPath, bunnyConfig, putToBunny, BUNNY_NOT_CONFIGURED } from '@/lib/backup/bunny';

/**
 * Resize an image to the width its page actually displays it at, and point
 * the CMS field at the new file.
 *
 * This is the half the existing optimiser never had. `@activeset/cms-alt
 * --compress` already uploads and repoints, but it re-encodes at *unchanged
 * dimensions* — there is not one `.resize(` in that pipeline — so a 3494px
 * image displayed at 200px stayed 3494px and merely changed format. And the
 * half the Weight tab never had is the write-back: it could measure the right
 * width and then only tell you about it.
 *
 * So the two are joined here rather than rebuilt. The measured target width
 * comes from `image_budget`, which is the only thing that can know it — a
 * browser laying the page out — and the upload-and-patch path is the one the
 * CLI already proved against live Webflow.
 *
 * **CMS fields only, and that is a hard limit rather than a missing feature.**
 * Webflow's Assets API can create an asset and edit its metadata; it cannot
 * replace the bytes of an existing one, and a Designer-placed image cannot be
 * repointed through the API at all. Those are reported, never guessed at.
 *
 * **Every original is archived to Bunny storage before anything is written**,
 * and an image whose backup fails is not touched. This is the first thing the
 * tool does that overwrites a client's live site, and "the old Webflow asset
 * is probably still there" is not an undo.
 */

export interface ImageApplyPayload {
  /** Measured findings to act on, from the Weight tab. */
  fingerprints?: string[];
  /**
   * Image URLs to act on, from the Webflow tab's library view.
   *
   * These usually have no measurement — the library knows what exists, not
   * what any page displays it at — so they are re-encoded at their original
   * dimensions unless a measurement happens to exist for one. That is what
   * `--compress` always did; this adds the archive, the better encoder, and
   * the resize when the width *is* known.
   */
  srcs?: string[];
  /** Publish the changed CMS items afterwards. Off by default. */
  publish?: boolean;
  by?: string;
}

export interface ImageApplyResult {
  requested: number;
  /** Images re-encoded and uploaded as new Webflow assets. */
  uploaded: number;
  /** Of those, how many were narrowed to a measured display width. */
  resized: number;
  /** And how many were only re-encoded, because nothing had measured them. */
  recompressedOnly: number;
  /** CMS fields repointed at the new file. */
  repointed: number;
  published: number;
  bytesSaved: number;
  /** Where the originals were archived, so a revert has somewhere to read from. */
  backedUpTo?: string;
  skipped: { fingerprint: string; reason: string }[];
  failed: { where: string; error: string }[];
}

/**
 * Every CMS image on the site, keyed by fingerprint — **all** matches, not the
 * first.
 *
 * `alt_apply` keeps only the first entry per fingerprint, which is harmless
 * for alt text: writing the same sentence onto one of five items that share a
 * photo still leaves the other four correct next time. It is not harmless for
 * a URL swap. Repointing one item and leaving four pointing at the oversized
 * original would report as fixed while four fifths of the problem stayed on
 * the site.
 */
async function buildCmsIndex(
  siteId: string,
  token: string,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<Map<string, CmsImageEntry[]>> {
  const index = new Map<string, CmsImageEntry[]>();
  const collections = await listCollections(siteId, token);

  for (const [i, collection] of collections.entries()) {
    await onProgress(
      `Reading ${collection.displayName ?? collection.slug}`,
      0.05 + (i / Math.max(1, collections.length)) * 0.25,
    );
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
          if (!key) continue;
          index.set(key, [...(index.get(key) ?? []), entry]);
        }
      }
      offset += items.length;
      if (items.length === 0 || offset >= (pagination.total ?? offset)) break;
    }
  }

  return index;
}

function fileNameFor(src: string, width: number | null, ext: string): string {
  const tail = (() => {
    try {
      return new URL(src).pathname.split('/').filter(Boolean).pop() ?? 'image';
    } catch {
      return 'image';
    }
  })();
  // The output extension, not the input's: WebP bytes uploaded as `.jpg` is
  // the other half of the bug the published CLI had to fix.
  const base = tail.replace(/\.[^.]+$/, '');
  // No width suffix when nothing was resized — the name would be a claim
  // about a measurement that does not exist.
  return width === null ? `${base}.${ext}` : `${base}@${width}w.${ext}`;
}

export async function runImageApply(
  projectId: string,
  payload: ImageApplyPayload,
  onProgress: (message: string, fraction?: number) => Promise<void> | void,
): Promise<ImageApplyResult> {
  const targets = [
    ...(payload.fingerprints ?? []).map((fingerprint) => ({ fingerprint, src: undefined as string | undefined })),
    ...(payload.srcs ?? []).map((src) => ({ fingerprint: imageFingerprint(src), src })),
  ];
  // The same image can arrive from both screens.
  const seen = new Set<string>();
  const requested = targets.filter((t) => (seen.has(t.fingerprint) ? false : (seen.add(t.fingerprint), true)));

  const result: ImageApplyResult = {
    requested: requested.length,
    uploaded: 0,
    resized: 0,
    recompressedOnly: 0,
    repointed: 0,
    published: 0,
    bytesSaved: 0,
    skipped: [],
    failed: [],
  };
  if (result.requested === 0) return result;

  const project = await loadProjectDocAdmin(projectId);
  const siteId = project?.webflowConfig?.siteId;
  if (!siteId) throw new Error('This project has no Webflow site configured');
  const token = await getWebflowTokenAdmin(projectId);
  if (!token) throw new Error('This project has no Webflow API token configured');

  // Refused rather than skipped. An apply with no archive is the one shape of
  // this job that cannot be undone, so it does not run at all.
  const bunny = bunnyConfig();
  if (!bunny) throw new Error(BUNNY_NOT_CONFIGURED);
  result.backedUpTo = bunny.cdnHost ? `https://${bunny.cdnHost}` : `${bunny.zone} (storage only — set BUNNY_CDN_HOST to read it back)`;

  await onProgress('Loading the measurements', 0.02);
  const findingDocs = await adminDb
    .collection(COLLECTIONS.PROJECTS)
    .doc(projectId)
    .collection('image_budget')
    .get();

  // Every measurement, not only the requested ones: a URL that arrived from
  // the library may well have been measured on some page, and if it has, the
  // right thing is to resize rather than only re-encode.
  const measurements = new Map<string, StoredWeightFinding>();
  for (const doc of findingDocs.docs) {
    const finding = doc.data() as StoredWeightFinding;
    measurements.set(finding.fingerprint, finding);
  }

  const cmsIndex = await buildCmsIndex(siteId, token, onProgress);

  const updates: CmsUpdatePayload[] = [];
  const applied = new Set<string>();
  const archives = new Map<string, string>();
  const appliedUrls = new Map<string, { src: string; bytes: number; targetWidth: number | null }>();
  const now = new Date().toISOString();

  for (const [i, target] of requested.entries()) {
    await onProgress(`Optimising ${i + 1}/${requested.length}`, 0.3 + (i / Math.max(1, requested.length)) * 0.4);

    const entries = cmsIndex.get(target.fingerprint);
    if (!entries?.length) {
      result.skipped.push({
        fingerprint: target.fingerprint,
        reason: 'not a CMS image — a site asset cannot have its bytes replaced, and a Designer image cannot be repointed',
      });
      continue;
    }

    const finding = measurements.get(target.fingerprint);
    const src = target.src ?? finding?.src ?? entries[0].imageUrl;

    // Resize only to a width something actually measured. An image that no
    // page has been measured at is re-encoded at its own dimensions, which is
    // what the old --compress did for everything — inventing a target would
    // be worse than leaving the dimensions alone.
    const targetWidth = finding?.verdict === 'oversized' ? finding.targetWidth : null;

    if (finding && finding.verdict === 'undersized') {
      // No amount of re-encoding fixes soft; it needs a better original.
      result.skipped.push({ fingerprint: target.fingerprint, reason: 'too small for retina — needs a better original' });
      continue;
    }

    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        result.failed.push({ where: src, error: `could not fetch the original (${res.status})` });
        continue;
      }
      const original = Buffer.from(await res.arrayBuffer());

      // Archive first. If this fails the image is left exactly as it was.
      const archived = await putToBunny(
        bunny,
        backupPath(projectId, target.fingerprint, fileNameOf(src), now),
        original,
        res.headers.get('content-type') ?? 'application/octet-stream',
      );

      const encoded = await encodeAtWidth(original, targetWidth, finding?.format ?? '');
      if (!encoded) {
        result.skipped.push({
          fingerprint: target.fingerprint,
          reason: 'nothing smaller was possible without a visible change',
        });
        continue;
      }

      const uploaded = await uploadAssetToWebflow(
        siteId,
        token,
        fileNameFor(src, targetWidth, encoded.ext),
        encoded.bytes,
        encoded.ext === 'avif' ? 'image/avif' : 'image/webp',
      );
      result.uploaded += 1;
      if (targetWidth === null) result.recompressedOnly += 1;
      else result.resized += 1;
      result.bytesSaved += Math.max(0, original.byteLength - encoded.bytes.byteLength);

      // Every item that referenced the old file, not just the first.
      for (const entry of entries) {
        updates.push({
          collectionId: entry.collectionId,
          itemId: entry.itemId,
          fieldSlug: entry.fieldSlug,
          fieldType: entry.fieldType,
          imageIndex: entry.imageIndex,
          newUrl: uploaded.hostedUrl,
          // The patch builders write `alt` unconditionally, so leaving this
          // empty would blank the alt text the alt-text feature just wrote.
          newAlt: entry.currentAlt,
          rawFieldValue: entry.rawFieldValue,
        });
      }
      applied.add(target.fingerprint);
      archives.set(target.fingerprint, archived.url ?? archived.path);
      appliedUrls.set(target.fingerprint, { src, bytes: original.byteLength, targetWidth });
    } catch (error) {
      result.failed.push({ where: src, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (updates.length > 0) {
    await onProgress(`Repointing ${updates.length} CMS fields`, 0.75);
    const grouped = groupUpdatesByItem(updates);
    const byCollection = new Map<string, { id: string; fieldData: Record<string, unknown> }[]>();
    for (const entry of grouped.values()) {
      const items = byCollection.get(entry.collectionId) ?? [];
      items.push({ id: entry.itemId, fieldData: entry.fieldData });
      byCollection.set(entry.collectionId, items);
    }

    const publishable = new Map<string, string[]>();
    for (const [collectionId, items] of byCollection) {
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        const res = await patchItems(collectionId, token, chunk);
        if (res.ok) {
          result.repointed += chunk.length;
          publishable.set(collectionId, [...(publishable.get(collectionId) ?? []), ...chunk.map((c) => c.id)]);
        } else {
          result.failed.push({
            where: `collection ${collectionId}`,
            error: `${res.status}: ${res.text.slice(0, 160)}`,
          });
        }
      }
    }

    if (payload.publish) {
      for (const [collectionId, itemIds] of publishable) {
        await onProgress(`Publishing ${itemIds.length} items`, 0.92);
        const res = await publishItems(collectionId, token, itemIds);
        if (res.ok) result.published += itemIds.length;
        else {
          result.failed.push({
            where: `publish ${collectionId}`,
            error: `${res.status}: ${res.text.slice(0, 160)}`,
          });
        }
      }
    }
  }

  await recordApplied(projectId, appliedUrls, archives, now, payload.by ?? 'worker');
  return result;
}

/**
 * Mark what was swapped as fixed-but-unverified, so the next measurement
 * confirms or regresses it through the path that already exists rather than a
 * second one. The original URL travels with the decision: findings are wiped
 * and rewritten on every run, so without it there would be no record of what
 * the image used to be.
 */
async function recordApplied(
  projectId: string,
  appliedUrls: Map<string, { src: string; bytes: number; targetWidth: number | null }>,
  archives: Map<string, string>,
  now: string,
  by: string,
): Promise<void> {
  const collection = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId).collection('audit_decisions');
  const entries = [...appliedUrls.entries()];

  for (let i = 0; i < entries.length; i += 400) {
    const batch = adminDb.batch();
    for (const [fingerprint, applied] of entries.slice(i, i + 400)) {
      batch.set(collection.doc(decisionId('weight', fingerprint)), {
        kind: 'weight',
        fingerprint,
        decision: 'fixed_unverified',
        previousUrl: applied.src,
        previousBytes: applied.bytes,
        targetWidth: applied.targetWidth ?? undefined,
        backupUrl: archives.get(fingerprint),
        by,
        at: now,
        updatedAt: AdminTimestamp.now(),
      });
    }
    await batch.commit();
  }
}
