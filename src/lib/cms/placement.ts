import { getCollection, listCollections, listItems } from './webflow-client';
import { extractAllImages } from './extract';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { resolveAssets, type WebflowAssetSummary } from '@/modules/site-monitoring/domain/webflow-assets';

/**
 * Where an image on a page actually lives in Webflow.
 *
 * This is the question that decides whether anything can be done about it.
 * A CMS image's URL sits in a collection field and can be repointed. A site
 * asset's bytes cannot be replaced at all, and an image placed in Designer
 * cannot be reached through the API. Same-looking `cdn.prod.website-files.com`
 * URL, three completely different answers.
 *
 * `unknown` is a real and common outcome, not a failure to try harder. Asset
 * matching only trusts an exact URL or a uniquely-named file — on Canopy that
 * recovered one image in eleven — so a third bucket is honest where a
 * two-way fixable/not-fixable split would be a guess.
 */
export type ImagePlacement = 'cms' | 'asset' | 'unknown';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export async function listSiteAssets(siteId: string, token: string): Promise<WebflowAssetSummary[]> {
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

/**
 * Label each of `srcs` by where it lives.
 *
 * Never throws. Webflow has no retry or rate-limit handling in this client and
 * every list call throws on a non-ok status, so a busy minute would otherwise
 * take down a measurement run that works perfectly well without this. A
 * failure here means every image comes back `unknown`, which is exactly what
 * we knew before asking.
 */
export async function placementsFor(
  siteId: string,
  token: string,
  srcs: readonly string[],
): Promise<Map<string, ImagePlacement>> {
  const placements = new Map<string, ImagePlacement>();
  for (const src of srcs) placements.set(imageFingerprint(src), 'unknown');

  try {
    const collections = await listCollections(siteId, token);
    for (const collection of collections) {
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
            if (placements.has(key)) placements.set(key, 'cms');
          }
        }
        offset += items.length;
        if (items.length === 0 || offset >= (pagination.total ?? offset)) break;
      }
    }
  } catch {
    // Leave whatever was learned before the failure; the rest stay unknown.
  }

  try {
    const assets = await listSiteAssets(siteId, token);
    const resolved = resolveAssets(srcs, assets);
    for (const [src] of Object.entries(resolved)) {
      const key = imageFingerprint(src);
      // CMS wins: an image can be both, and only the CMS field is repointable.
      if (placements.get(key) === 'unknown') placements.set(key, 'asset');
    }
  } catch {
    // Same again — an unlabelled finding is still a useful finding.
  }

  return placements;
}

/** What to tell someone about an image that is not a CMS field value. */
export const PLACEMENT_HINT: Record<ImagePlacement, string> = {
  cms: 'In a CMS field — can be resized and repointed from here.',
  asset: 'A site asset. Webflow cannot replace an asset’s file, so this one is a swap in Designer.',
  unknown: 'Not matched to a CMS field or a named asset — most likely placed in Designer. Swap it there.',
};

/**
 * The folder optimised copies for Designer go into, created on first use.
 *
 * A near-duplicate of every oversized image scattered through a client's asset
 * library would make it worse to use, which is the opposite of the point. One
 * clearly named folder keeps the copies findable in Designer's asset panel and
 * easy to clear out once the swaps are done.
 */
export const OPTIMISED_FOLDER_NAME = 'ActiveSet · optimised';

export async function ensureOptimisedFolder(siteId: string, token: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, accept: 'application/json' };
  const list = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/asset_folders`, { headers });
  if (!list.ok) throw new Error(`Webflow refused the asset folder list (${list.status})`);
  const { assetFolders = [] } = (await list.json()) as { assetFolders?: { id: string; displayName?: string }[] };
  const existing = assetFolders.find((folder) => folder.displayName === OPTIMISED_FOLDER_NAME);
  if (existing) return existing.id;

  const created = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/asset_folders`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: OPTIMISED_FOLDER_NAME }),
  });
  if (!created.ok) throw new Error(`Webflow refused to create the "${OPTIMISED_FOLDER_NAME}" folder (${created.status})`);
  return ((await created.json()) as { id: string }).id;
}
