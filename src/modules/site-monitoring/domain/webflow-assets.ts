/**
 * Which images on a page are actually editable through Webflow's Assets API.
 *
 * This exists because of a wrong assumption that shipped. Every Webflow CDN
 * URL looks like `<24-hex>_<filename>`, so it is tempting — and I did it — to
 * read that prefix as the asset id and offer to write alt text straight to it.
 * It is not the asset id. Webflow re-encodes images for delivery and the
 * served file carries its own id, and images that belong to a CMS item never
 * appear in the site's asset list at all.
 *
 * Measured on Canopy: of eleven images needing alt text, the id parsed from
 * the URL matched a real asset for **none** of them, and matching by filename
 * recovered exactly one. Every "Save to Webflow" press returned
 * `Requested resource not found: Asset not found`.
 *
 * So nothing here guesses. An image is writable only if the site's asset list
 * says so, and everything else is told plainly that it has to be set where it
 * lives — on the CMS item, or in Designer.
 */

export interface WebflowAssetSummary {
  id: string;
  displayName?: string;
  originalFileName?: string;
  hostedUrl?: string;
  altText?: string | null;
  variants?: { hostedUrl?: string }[];
}

/**
 * Strip everything that differs between the same image's many URLs: the id
 * prefix, the extension, Webflow's `-p-500` size suffix, percent-encoding and
 * punctuation.
 */
export function normaliseAssetName(value: string): string {
  let name = value;
  try {
    name = decodeURIComponent(name);
  } catch {
    // A malformed escape is not worth failing over; compare what we have.
  }
  return name
    .replace(/^[0-9a-f]{24}_/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-p-\d+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function fileNameFromUrl(src: string): string {
  try {
    return new URL(src).pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    return src.split('?')[0].split('/').pop() ?? '';
  }
}

/** The 24-hex prefix a Webflow URL carries. A hint only — never an asset id. */
export function idPrefixOf(src: string): string | null {
  const match = /^([0-9a-f]{24})_/i.exec(fileNameFromUrl(src));
  return match ? match[1] : null;
}

/**
 * Resolve page image URLs to asset ids, exactly and then by name.
 *
 * Exact first: an asset's own `hostedUrl` or one of its variant URLs is
 * unambiguous. Name matching is the fallback, and only when a single asset
 * claims that name — two files called `hero.png` mean we do not know which,
 * and writing alt text to the wrong one is worse than offering nothing.
 */
export function resolveAssets(
  srcs: readonly string[],
  assets: readonly WebflowAssetSummary[],
): Record<string, string> {
  const byUrlTail = new Map<string, string>();
  const byName = new Map<string, string | null>();

  for (const asset of assets) {
    for (const url of [asset.hostedUrl, ...(asset.variants ?? []).map((v) => v.hostedUrl)]) {
      if (url) byUrlTail.set(fileNameFromUrl(url).toLowerCase(), asset.id);
    }
    const name = normaliseAssetName(asset.displayName ?? asset.originalFileName ?? '');
    if (!name) continue;
    // null marks "more than one asset has this name", so it is never used.
    byName.set(name, byName.has(name) ? null : asset.id);
  }

  const resolved: Record<string, string> = {};
  for (const src of srcs) {
    const tail = fileNameFromUrl(src).toLowerCase();
    const exact = byUrlTail.get(tail);
    if (exact) {
      resolved[src] = exact;
      continue;
    }
    const named = byName.get(normaliseAssetName(tail));
    if (named) resolved[src] = named;
  }
  return resolved;
}

/** What to tell someone about an image the Assets API cannot reach. */
export const NOT_AN_ASSET_HINT =
  'Not a site asset — it belongs to a CMS item or was uploaded another way. Set the alt text where the image lives.';
