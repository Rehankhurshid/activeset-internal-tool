import type { WebflowConfig } from '@/types/webflow';

/** Non-secret fields used to build public page/sitemap URLs. */
export interface WebflowUrlHints {
  customDomain?: string | null;
  /** Webflow site slug — `{shortName}.webflow.io` always serves this site. */
  shortName?: string | null;
}

export function normalizePublicBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, '');
}

export function webflowSubdomainUrl(shortName?: string | null): string | undefined {
  const slug = shortName?.trim().toLowerCase();
  return slug ? `https://${slug}.webflow.io` : undefined;
}

/**
 * Hosts that might serve the connected site, most preferred first: the saved
 * domain, then the `{shortName}.webflow.io` subdomain. The saved domain is not
 * proof — a client's live domain often still points at their old site while we
 * build the new one, so server code checks each with `data-wf-site` before use
 * (see `resolveConnectedSiteBaseUrl` in webflow-sitemap-io.ts).
 */
export function candidateWebflowBaseUrls(hints: WebflowUrlHints): string[] {
  const out: string[] = [];
  if (hints.customDomain?.trim()) out.push(normalizePublicBaseUrl(hints.customDomain));
  const subdomain = webflowSubdomainUrl(hints.shortName);
  if (subdomain && !out.includes(subdomain)) out.push(subdomain);
  return out;
}

/** First candidate host, unverified. For the browser, which cannot check `data-wf-site`. */
export function resolveWebflowPublicBaseUrl(hints: WebflowUrlHints): string | undefined {
  return candidateWebflowBaseUrls(hints)[0];
}

/** Default sitemap location when the project has no saved sitemap URL yet. */
export function resolveWebflowSitemapUrl(
  hints: WebflowUrlHints,
  projectSitemapUrl?: string | null
): string | undefined {
  const saved = projectSitemapUrl?.trim();
  if (saved) return normalizePublicBaseUrl(saved);

  const base = resolveWebflowPublicBaseUrl(hints);
  if (!base) return undefined;
  return `${base}/sitemap.xml`;
}

export function webflowConfigToUrlHints(config?: WebflowConfig | null): WebflowUrlHints {
  return {
    customDomain: config?.customDomain,
    shortName: config?.shortName,
  };
}

/**
 * `GET /v2/sites/{id}` payload → hints. `previewUrl` is deliberately ignored:
 * it is a screenshot PNG on screenshots.webflow.com, not a host.
 */
export function urlHintsFromWebflowSitePayload(site: Record<string, unknown>): WebflowUrlHints {
  return {
    shortName: typeof site.shortName === 'string' ? site.shortName : undefined,
  };
}

/** The Webflow site id a published page belongs to (`<html data-wf-site="…">`). */
export function extractWebflowSiteId(html: string): string | null {
  const match = html.match(/data-wf-site="([a-f0-9]{24})"/i);
  return match ? match[1].toLowerCase() : null;
}

/** Pages the Data API lists that are not URLs to audit: drafts, error pages, CMS templates. */
export function isAuditablePage(page: {
  publishedPath?: string;
  collectionId?: string | null;
  draft?: boolean;
  archived?: boolean;
}): boolean {
  if (page.draft || page.archived) return false;
  // A CMS template's publishedPath is its folder, not a page; items come from the sitemap.
  if (page.collectionId) return false;
  const path = (page.publishedPath || '').replace(/\/$/, '').toLowerCase();
  return path !== '/404' && path !== '/401';
}

export function buildWebflowPageUrl(
  baseUrl: string,
  publishedPath?: string,
  slug?: string
): string | undefined {
  const path = publishedPath || (slug ? `/${slug}` : '');
  if (!path) return undefined;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`.replace(/\/$/, '');
  return url || baseUrl;
}
