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
  const html = payload.rawFieldValue as string;
  const $ = cheerio.load(html, { decodeEntities: false });
  const imgs = $('img');

  if (payload.imageIndex < imgs.length) {
    const img = imgs.eq(payload.imageIndex);
    img.attr('alt', payload.newAlt);
    if (payload.newUrl) img.attr('src', payload.newUrl);
  }

  const result = $('body').html();
  return { [payload.fieldSlug]: result || html };
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

  for (const payload of updates) {
    const key = `${payload.collectionId}::${payload.itemId}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = { collectionId: payload.collectionId, itemId: payload.itemId, fieldData: {} };
      grouped.set(key, entry);
    }
    const patch = buildFieldPatch(payload);
    if (patch) Object.assign(entry.fieldData, patch);
  }

  return grouped;
}
