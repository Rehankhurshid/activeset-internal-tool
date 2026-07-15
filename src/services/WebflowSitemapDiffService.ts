/**
 * Pure (network-free) comparison logic for the Webflow ↔ sitemap drift check.
 *
 * Given the live list of Webflow pages and the URLs found in a project's
 * sitemap, it computes the two-directional set difference over **static pages
 * only**. CMS/collection content is excluded so individual blog posts (which
 * live under a template page, not their own Webflow page) don't get flagged.
 *
 * All matching happens on normalized path keys so a reverse-proxied sitemap on
 * a different host still lines up with Webflow's publishedPath.
 */

export interface RawWebflowPageInput {
  publishedPath?: string;
  slug?: string;
  collectionId?: string;
  draft?: boolean;
  archived?: boolean;
}

export interface ComputeSitemapDiffArgs {
  webflowPages: RawWebflowPageInput[];
  sitemapUrls: string[];
  /** Project folder → type map, e.g. { "/blog/*": "collection" }. */
  folderPageTypes?: Record<string, 'static' | 'collection'>;
}

export interface SitemapDiffResult {
  missingFromSitemap: string[];
  missingFromWebflow: string[];
  webflowStaticCount: number;
  sitemapStaticCount: number;
}

/**
 * Apply a project's ignore list to a raw diff result. The stored diff keeps the
 * raw lists; ignore is applied here at the edges (UI render + notifications) so
 * un-ignoring a path resurfaces it without re-running the network check.
 */
export function applyIgnore(
  paths: string[],
  ignorePaths: string[] = []
): string[] {
  if (ignorePaths.length === 0) return paths;
  const ignoreSet = new Set(ignorePaths.map(normalizePath));
  return paths.filter((p) => !ignoreSet.has(normalizePath(p)));
}

/**
 * Webflow's built-in utility pages are returned by the pages API but never
 * belong in a sitemap, so we don't flag them as "missing from sitemap".
 */
const WEBFLOW_UTILITY_PATHS = new Set(['/404', '/401']);

/**
 * Reduce a URL or path to a comparable key: pathname only, lowercased, no
 * trailing slash, empty → "/".
 */
export function normalizePath(input: string): string {
  if (!input) return '/';
  let path = input.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      // not a valid URL — fall through and treat the raw string as a path
    }
  }
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.toLowerCase().replace(/\/+$/, '');
  return path || '/';
}

/** First path segment as a wildcard folder pattern, e.g. "/blog/post" → "/blog/*". */
function getFolderPatternFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return `/${parts[0].toLowerCase()}/*`;
}

/** Match a path against a glob-ish folder pattern ("/blog/*") or an exact path. */
function matchesPattern(pathname: string, pattern: string): boolean {
  const p = pathname.replace(/\/+$/, '').toLowerCase();
  const pat = pattern.replace(/\/+$/, '').toLowerCase();
  if (pat.endsWith('/*')) {
    const prefix = pat.slice(0, -2);
    return p === prefix || p.startsWith(prefix + '/');
  }
  return p === pat;
}

function pathForPage(page: RawWebflowPageInput): string {
  if (page.publishedPath) return normalizePath(page.publishedPath);
  if (page.slug) return normalizePath(`/${page.slug}`);
  return '/';
}

export function computeSitemapDiff({
  webflowPages,
  sitemapUrls,
  folderPageTypes = {},
}: ComputeSitemapDiffArgs): SitemapDiffResult {
  const published = webflowPages.filter((p) => !p.draft && !p.archived);

  // Static Webflow pages (no collectionId) — the set we expect the sitemap to cover.
  const webflowStaticPaths = new Set<string>();
  // Folder patterns that hold CMS content — used to exclude CMS item URLs from the sitemap side.
  const collectionFolders = new Set<string>();

  for (const page of published) {
    const path = pathForPage(page);
    if (page.collectionId) {
      const folder = getFolderPatternFromPath(path);
      if (folder) collectionFolders.add(folder);
    } else {
      webflowStaticPaths.add(path);
    }
  }

  // Fold in the project's own folder classifications (manual/legacy overrides).
  for (const [pattern, type] of Object.entries(folderPageTypes)) {
    if (type === 'collection') collectionFolders.add(pattern.toLowerCase());
  }

  const isCollectionPath = (path: string): boolean => {
    for (const folder of collectionFolders) {
      if (matchesPattern(path, folder)) return true;
    }
    return false;
  };

  // Sitemap paths (deduped). Static = not under a known CMS folder.
  const sitemapPathSet = new Set<string>();
  const sitemapStaticPaths = new Set<string>();
  for (const url of sitemapUrls) {
    const path = normalizePath(url);
    sitemapPathSet.add(path);
    if (!isCollectionPath(path)) sitemapStaticPaths.add(path);
  }

  // Raw diffs. The ignore list is applied later (see applyIgnore) so that the
  // stored snapshot stays complete and un-ignoring a path resurfaces it.
  const missingFromSitemap = [...webflowStaticPaths]
    .filter((p) => !sitemapPathSet.has(p) && !WEBFLOW_UTILITY_PATHS.has(p))
    .sort();
  const missingFromWebflow = [...sitemapStaticPaths]
    .filter((p) => !webflowStaticPaths.has(p))
    .sort();

  return {
    missingFromSitemap,
    missingFromWebflow,
    webflowStaticCount: webflowStaticPaths.size,
    sitemapStaticCount: sitemapStaticPaths.size,
  };
}
