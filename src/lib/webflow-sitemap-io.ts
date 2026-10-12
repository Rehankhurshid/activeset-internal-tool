import 'server-only';
import type { Project, WebflowSitemapDiff } from '@/types';
import { getWebflowToken } from '@/services/projectSecrets';
import {
  computeSitemapDiff,
  type RawWebflowPageInput,
} from '@/services/WebflowSitemapDiffService';
import {
  candidateWebflowBaseUrls,
  extractWebflowSiteId,
  urlHintsFromWebflowSitePayload,
  webflowConfigToUrlHints,
  webflowSubdomainUrl,
  type WebflowUrlHints,
} from '@/lib/webflow-public-url';
import type { WebflowConfig } from '@/types/webflow';

/**
 * Network I/O + orchestration for the Webflow ↔ sitemap drift check.
 * Server-only (reads the Webflow token from the secrets collection).
 */

const WEBFLOW_API = 'https://api.webflow.com/v2';
const SITEMAP_FETCH_TIMEOUT_MS = 20_000;
const MAX_CHILD_SITEMAPS = 50;
const HOST_CHECK_TIMEOUT_MS = 10_000;

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

/** Load URL hints (`shortName`) from `GET /v2/sites/{siteId}` (server-only). */
export async function fetchWebflowSiteUrlHints(
  siteId: string,
  apiToken: string
): Promise<WebflowUrlHints> {
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    accept: 'application/json',
  };
  const response = await fetch(`${WEBFLOW_API}/sites/${siteId}`, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Webflow site details: ${response.status} ${response.statusText}`
    );
  }
  const siteData = (await response.json()) as Record<string, unknown>;
  return urlHintsFromWebflowSitePayload(siteData);
}

/**
 * Which Webflow site a host serves, read from its home page's `data-wf-site`.
 * `null` when it cannot tell (unreachable, password page, not Webflow).
 */
export async function fetchServedWebflowSiteId(baseUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(HOST_CHECK_TIMEOUT_MS),
      headers: { 'User-Agent': 'ActiveSet-Site-Check/1.0' },
    });
    if (!response.ok) return null;
    return extractWebflowSiteId(await response.text());
  } catch {
    return null;
  }
}

/**
 * The host the connected Webflow site is actually published on. The saved
 * domain wins only if it serves this site: while a rebuild is in progress the
 * client's live domain still serves their old site, and auditing it would
 * audit the wrong website. Otherwise `{shortName}.webflow.io`, which always
 * belongs to the site.
 */
export async function resolveConnectedSiteBaseUrl(
  config: WebflowConfig,
  apiToken: string
): Promise<string | undefined> {
  let hints = webflowConfigToUrlHints(config);
  if (!hints.shortName) {
    try {
      hints = { ...hints, ...(await fetchWebflowSiteUrlHints(config.siteId, apiToken)) };
    } catch (err) {
      console.warn('[webflow-sitemap-io] Could not load site details:', err);
    }
  }

  const siteId = config.siteId.toLowerCase();
  const candidates = candidateWebflowBaseUrls(hints);
  for (const candidate of candidates) {
    if ((await fetchServedWebflowSiteId(candidate)) === siteId) return candidate;
  }
  // Nothing confirmed (unpublished, password-protected): the subdomain is still
  // this site's, the saved domain may not be.
  return webflowSubdomainUrl(hints.shortName) ?? candidates[0];
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
  let sitemapUrl = project.sitemapUrl?.trim() || '';
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

    const apiToken = await getWebflowToken(project.id);
    if (!apiToken) {
      return { ...base, error: 'No Webflow API token configured for this project' };
    }

    if (!sitemapUrl && project.webflowConfig) {
      const baseUrl = await resolveConnectedSiteBaseUrl(project.webflowConfig, apiToken);
      if (baseUrl) sitemapUrl = `${baseUrl}/sitemap.xml`;
    }

    if (!sitemapUrl) {
      return {
        ...base,
        error:
          'No sitemap URL configured. Add a sitemap URL or connect Webflow so the app can use the staging sitemap.',
      };
    }

    base.sitemapUrl = sitemapUrl;

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
