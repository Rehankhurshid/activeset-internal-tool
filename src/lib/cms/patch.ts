/**
 * Patch payload builders for Webflow CMS image/multi-image/rich-text fields.
 * Shared by the /api/webflow/cms/update route and the CLI.
 */

import * as cheerio from 'cheerio';
import type { CmsUpdatePayload } from '@/types/webflow';

export function buildImageFieldPatch(payload: CmsUpdatePayload): Record<string, unknown> {
  const raw = payload.rawFieldValue as { url?: string; fileId?: string } | undefined;
  return {
    [payload.fieldSlug]: {
      url: payload.newUrl || raw?.url,
      alt: payload.newAlt,
    },
  };
}

export function buildMultiImageFieldPatch(payload: CmsUpdatePayload): Record<string, unknown> {
  const images = (payload.rawFieldValue as Array<{ url?: string; alt?: string; fileId?: string }>).map(
    (img, idx) => {
      if (idx === payload.imageIndex) {
        return {
          url: payload.newUrl || img.url,
          alt: payload.newAlt,
        };
      }
      return img;
    }
  );
  return { [payload.fieldSlug]: images };
}

export function buildRichTextFieldPatch(payload: CmsUpdatePayload): Record<string, unknown> {
  return applyRichTextUpdates(payload.fieldSlug, payload.rawFieldValue as string, [payload]);
}

/**
 * Apply N RichText image updates (same field, same item) to a single HTML
 * string and return the field patch. Must be used when multiple images in the
 * same RichText field are being updated in one batch — otherwise rebuilding
 * from the original rawFieldValue for each update would clobber siblings.
 */
export function applyRichTextUpdates(
  fieldSlug: string,
  originalHtml: string,
  payloads: CmsUpdatePayload[]
): Record<string, unknown> {
  const $ = cheerio.load(originalHtml, { decodeEntities: false });
  const imgs = $('img');

  for (const p of payloads) {
    if (p.imageIndex < imgs.length) {
      const img = imgs.eq(p.imageIndex);
      img.attr('alt', p.newAlt);
      if (p.newUrl) img.attr('src', p.newUrl);
    }
  }

  const result = $('body').html();
  return { [fieldSlug]: result || originalHtml };
}

export function buildFieldPatch(payload: CmsUpdatePayload): Record<string, unknown> | null {
  switch (payload.fieldType) {
    case 'Image':
      return buildImageFieldPatch(payload);
    case 'MultiImage':
      return buildMultiImageFieldPatch(payload);
    case 'RichText':
      return buildRichTextFieldPatch(payload);
    default:
      return null;
  }
}

/**
 * Groups a set of updates into per-item patches (one item may have many updates
 * across different fields or indices — they all merge into a single fieldData).
 */
export function groupUpdatesByItem(updates: CmsUpdatePayload[]): Map<
  string,
  { collectionId: string; itemId: string; fieldData: Record<string, unknown> }
> {
  const grouped = new Map<string, { collectionId: string; itemId: string; fieldData: Record<string, unknown> }>();

  // First pass: bucket updates per (item, fieldSlug) so RichText edits to
  // multiple images in the same field merge into a single HTML rewrite
  // instead of the last update clobbering earlier ones.
  type FieldBucket = { type: CmsUpdatePayload['fieldType']; originalHtml?: string; payloads: CmsUpdatePayload[] };
  const byItemField = new Map<string, Map<string, FieldBucket>>();

  for (const p of updates) {
    const itemKey = `${p.collectionId}::${p.itemId}`;
    let fields = byItemField.get(itemKey);
    if (!fields) {
      fields = new Map();
      byItemField.set(itemKey, fields);
    }
    let bucket = fields.get(p.fieldSlug);
    if (!bucket) {
      bucket = { type: p.fieldType, payloads: [] };
      if (p.fieldType === 'RichText') bucket.originalHtml = p.rawFieldValue as string;
      fields.set(p.fieldSlug, bucket);
    }
    bucket.payloads.push(p);
  }

  for (const [itemKey, fields] of byItemField) {
    const first = fields.values().next().value!.payloads[0];
    const entry = { collectionId: first.collectionId, itemId: first.itemId, fieldData: {} as Record<string, unknown> };

    for (const [fieldSlug, bucket] of fields) {
      if (bucket.type === 'RichText') {
        const patch = applyRichTextUpdates(fieldSlug, bucket.originalHtml || '', bucket.payloads);
        Object.assign(entry.fieldData, patch);
      } else if (bucket.type === 'MultiImage') {
        const original = bucket.payloads[0].rawFieldValue as Array<{ url?: string; alt?: string; fileId?: string }>;
        const byIndex = new Map<number, CmsUpdatePayload>();
        for (const p of bucket.payloads) byIndex.set(p.imageIndex, p);
        const merged = original.map((img, idx) => {
          const p = byIndex.get(idx);
          if (!p) return img;
          return { ...img, url: p.newUrl || img.url, alt: p.newAlt };
        });
        entry.fieldData[fieldSlug] = merged;
      } else {
        for (const p of bucket.payloads) {
          const patch = buildFieldPatch(p);
          if (patch) Object.assign(entry.fieldData, patch);
        }
      }
    }

    grouped.set(itemKey, entry);
  }

  return grouped;
}
