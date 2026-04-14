/**
 * Image extraction from CMS items. Shared by the /api/webflow/cms/items route
 * and the CLI.
 */

import * as cheerio from 'cheerio';
import type { CmsImageEntry, CollectionField } from './types';
import type { WebflowItem } from './webflow-client';

export const BAD_ALTS = new Set(['__wf_reserved_inherit', '']);

export function isMissingAlt(alt: string | null | undefined): boolean {
  return alt == null || BAD_ALTS.has(alt.trim());
}

export function getItemName(fieldData: Record<string, unknown>): string {
  return (
    (fieldData.name as string) ||
    (fieldData.title as string) ||
    (fieldData.slug as string) ||
    'Untitled'
  );
}

export function extractImageFields(
  item: WebflowItem,
  collectionId: string,
  collectionName: string,
  fields: CollectionField[]
): CmsImageEntry[] {
  const entries: CmsImageEntry[] = [];
  const fd = item.fieldData || {};
  const itemName = getItemName(fd);

  for (const field of fields) {
    if (field.type === 'Image') {
      const img = fd[field.slug] as { url?: string; alt?: string | null; fileId?: string } | undefined;
      if (!img || !img.url) continue;

      const alt = img.alt ?? '';
      entries.push({
        id: `${collectionId}::${item.id}::${field.slug}::0`,
        collectionId,
        collectionName,
        itemId: item.id,
        itemName,
        fieldSlug: field.slug,
        fieldDisplayName: field.displayName,
        fieldType: 'Image',
        imageUrl: img.url,
        currentAlt: isMissingAlt(alt) ? '' : alt,
        isMissingAlt: isMissingAlt(alt),
        imageIndex: 0,
        rawFieldValue: img,
      });
    } else if (field.type === 'MultiImage') {
      const images = fd[field.slug] as Array<{ url?: string; alt?: string | null; fileId?: string }> | undefined;
      if (!Array.isArray(images)) continue;

      images.forEach((img, idx) => {
        if (!img.url) return;
        const alt = img.alt ?? '';
        entries.push({
          id: `${collectionId}::${item.id}::${field.slug}::${idx}`,
          collectionId,
          collectionName,
          itemId: item.id,
          itemName,
          fieldSlug: field.slug,
          fieldDisplayName: field.displayName,
          fieldType: 'MultiImage',
          imageUrl: img.url,
          currentAlt: isMissingAlt(alt) ? '' : alt,
          isMissingAlt: isMissingAlt(alt),
          imageIndex: idx,
          rawFieldValue: images,
        });
      });
    }
  }

  return entries;
}

export function extractRichTextImages(
  item: WebflowItem,
  collectionId: string,
  collectionName: string,
  fields: CollectionField[]
): CmsImageEntry[] {
  const entries: CmsImageEntry[] = [];
  const fd = item.fieldData || {};
  const itemName = getItemName(fd);

  for (const field of fields) {
    const html = fd[field.slug] as string | undefined;
    if (!html || typeof html !== 'string') continue;

    const $ = cheerio.load(html);
    $('img').each((index, el) => {
      const src = $(el).attr('src') || '';
      if (!src) return;

      const alt = $(el).attr('alt') || '';
      entries.push({
        id: `${collectionId}::${item.id}::${field.slug}::${index}`,
        collectionId,
        collectionName,
        itemId: item.id,
        itemName,
        fieldSlug: field.slug,
        fieldDisplayName: field.displayName,
        fieldType: 'RichText',
        imageUrl: src,
        currentAlt: isMissingAlt(alt) ? '' : alt,
        isMissingAlt: isMissingAlt(alt),
        imageIndex: index,
        rawFieldValue: html,
      });
    });
  }

  return entries;
}

export function extractAllImages(
  item: WebflowItem,
  collectionId: string,
  collectionName: string,
  allFields: CollectionField[]
): CmsImageEntry[] {
  const imageFields = allFields.filter(f => f.type === 'Image' || f.type === 'MultiImage');
  const richTextFields = allFields.filter(f => f.type === 'RichText');
  return [
    ...extractImageFields(item, collectionId, collectionName, imageFields),
    ...extractRichTextImages(item, collectionId, collectionName, richTextFields),
  ];
}
