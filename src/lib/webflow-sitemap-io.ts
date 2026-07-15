import 'server-only';
import type { Project, WebflowSitemapDiff } from '@/types';
import { getWebflowToken } from '@/services/projectSecrets';
import {
  computeSitemapDiff,
  type RawWebflowPageInput,
} from '@/services/WebflowSitemapDiffService';

/**
 * Network I/O + orchestration for the Webflow ↔ sitemap drift check.
 * Server-only (reads the Webflow token from the secrets collection).
 */

const WEBFLOW_API = 'https://api.webflow.com/v2';
const SITEMAP_FETCH_TIMEOUT_MS = 20_000;
const MAX_CHILD_SITEMAPS = 50;

function normalizeSitemapUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol;
}

/** Paginate `GET /v2/sites/{siteId}/pages` and return every page (raw). */
export async function fetchWebflowPages(
  siteId: string,
  apiToken: string
): Promise<RawWebflowPageInput[]> {
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    accept: 'application/json',
  };

  const pages: RawWebflowPageInput[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = new URL(`${WEBFLOW_API}/sites/${siteId}/pages`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Webflow pages: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const chunk: RawWebflowPageInput[] = Array.isArray(data.pages) ? data.pages : [];
    pages.push(...chunk);

    const total =
      typeof data.pagination?.total === 'number' ? data.pagination.total : undefined;
    offset += chunk.length;

    if (chunk.length < limit) break;
    if (typeof total === 'number' && offset >= total) break;
  }

  return pages;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Extract every `<loc>…</loc>` URL from a sitemap/sitemap-index XML string. */
function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const regex = /<loc>\s*([\s\S]*?)\s*<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const url = decodeXmlEntities(match[1].trim());
    if (url) locs.push(url);
  }
  return locs;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITEMAP_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a sitemap and return the page URLs. Handles a sitemap index by
 * recursing one level into its child sitemaps.
 */
export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const root = normalizeSitemapUrl(sitemapUrl);
  const xml = await fetchText(root);

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  if (!isIndex) {
    return extractLocs(xml);
  }

  // Sitemap index: the top-level <loc>s point at child sitemaps.
  const childSitemaps = extractLocs(xml).slice(0, MAX_CHILD_SITEMAPS);
  const results = await Promise.allSettled(
    childSitemaps.map((child) => fetchText(child).then(extractLocs))
  );

  const urls: string[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') urls.push(...result.value);
  }
  return urls;
}

/**
 * Shared entry point used by the on-demand routes and the daily cron.
 * Fetches the live Webflow page list + sitemap URLs, computes the diff, and
 * returns a snapshot. Never throws — failures come back as a snapshot with
 * `error` set so callers can persist/report them uniformly.
 */
export async function runSitemapDiff(project: Project): Promise<WebflowSitemapDiff> {
  const checkedAt = new Date().toISOString();
  const sitemapUrl = project.sitemapUrl?.trim() || '';
  const base: WebflowSitemapDiff = {
    checkedAt,
    sitemapUrl,
    missingFromSitemap: [],
    missingFromWebflow: [],
    webflowStaticCount: 0,
    sitemapStaticCount: 0,
  };

  try {
    const siteId = project.webflowConfig?.siteId;
    if (!siteId) return { ...base, error: 'Webflow is not connected for this project' };
    if (!sitemapUrl) return { ...base, error: 'No sitemap URL configured for this project' };

    const apiToken = await getWebflowToken(project.id);
    if (!apiToken) {
      return { ...base, error: 'No Webflow API token configured for this project' };
    }

    const [webflowPages, sitemapUrls] = await Promise.all([
      fetchWebflowPages(siteId, apiToken),
      fetchSitemapUrls(sitemapUrl),
    ]);

    const result = computeSitemapDiff({
      webflowPages,
      sitemapUrls,
      folderPageTypes: project.folderPageTypes,
    });

    return { ...base, ...result };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'Sitemap diff failed' };
  }
}
