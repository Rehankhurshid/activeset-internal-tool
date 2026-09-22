import { getCollection, listCollections, listItems, webflowFetch } from './webflow-client';
import { extractAllImages } from './extract';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import type { WebflowAssetSummary } from '@/modules/site-monitoring/domain/webflow-assets';
import type { CmsImageEntry } from '@/types/webflow';

/**
 * Reading a site's Webflow image library, once, for every job that needs it.
 *
 * There were four copies of "list the site's assets" and three of "index every
 * CMS image" across the worker handlers. They disagreed in ways that mattered:
 * one listed up to 5,000 assets and another 2,000, one threw on an error and
 * one quietly stopped and returned whatever it had — so a rate-limited page
 * read as "this site has fewer images". One version, which retries through
 * rate limits (via webflowFetch) and fails loudly otherwise.
 */

export async function listSiteAssets(siteId: string, token: string): Promise<WebflowAssetSummary[]> {
  const assets: WebflowAssetSummary[] = [];
  for (let offset = 0; offset < 10_000; offset += 100) {
    const res = await webflowFetch(`/sites/${siteId}/assets?limit=100&offset=${offset}`, token);
    if (!res.ok) throw new Error(`Webflow refused the asset list (${res.status})`);
    const page = (await res.json()) as { assets?: WebflowAssetSummary[]; pagination?: { total?: number } };
    assets.push(...(page.assets ?? []));
    if ((page.assets?.length ?? 0) < 100 || assets.length >= (page.pagination?.total ?? assets.length)) break;
  }
  return assets;
}

/** Every image in one collection: Image, MultiImage and Rich Text fields. */
export async function listCollectionImages(collectionId: string, token: string): Promise<CmsImageEntry[]> {
  const collection = (await getCollection(collectionId, token)) as unknown as {
    displayName?: string;
    slug?: string;
    fields?: unknown[];
  };
  const name = collection.displayName ?? collection.slug ?? collectionId;
  const fields = (collection.fields ?? []) as never[];
  const images: CmsImageEntry[] = [];

  let offset = 0;
  for (;;) {
    const { items, pagination } = await listItems(collectionId, token, offset, 100);
    for (const item of items) images.push(...extractAllImages(item as never, collectionId, name, fields));
    offset += items.length;
    if (items.length === 0 || offset >= (pagination.total ?? offset)) break;
  }
  return images;
}

/**
 * CMS images keyed by fingerprint, with **every** field that uses each one.
 *
 * All matches rather than the first, because an image reused across five
 * items has to be written in five places — for a URL swap and for alt text
 * alike. `collectionIds` narrows the read: undefined means every collection,
 * an empty list means none, which is what a job about site assets wants.
 */
export async function buildCmsIndex(
  siteId: string,
  token: string,
  options: {
    collectionIds?: string[];
    onProgress?: (message: string, fraction?: number) => Promise<void> | void;
  } = {},
): Promise<Map<string, CmsImageEntry[]>> {
  const index = new Map<string, CmsImageEntry[]>();
  if (options.collectionIds && options.collectionIds.length === 0) return index;

  const ids =
    options.collectionIds ?? (await listCollections(siteId, token)).map((collection) => collection.id);
  for (const [i, collectionId] of ids.entries()) {
    await options.onProgress?.(`Reading collection ${i + 1}/${ids.length}`, i / Math.max(1, ids.length));
    for (const entry of await listCollectionImages(collectionId, token)) {
      const key = imageFingerprint(entry.imageUrl);
      if (!key) continue;
      index.set(key, [...(index.get(key) ?? []), entry]);
    }
  }
  return index;
}
