import type { ProjectLink } from '@/types';

const STAGING_TITLE_REGEX = /\bstag(?:e|ing|nging)\b/i;
const LIVE_TITLE_REGEX = /\blive\b/i;

function normalizeToUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function findLinkHostByTitle(links: ProjectLink[], pattern: RegExp): string | null {
  const link = links.find((item) => pattern.test(item.title) && !!item.url?.trim());
  if (!link?.url) return null;

  const parsed = normalizeToUrl(link.url);
  return parsed?.host?.toLowerCase() || null;
}

/**
 * Remap a live URL to staging URL while preserving path/query/hash.
 * If staging/live mapping is unavailable, the original URL is returned.
 */
export function resolveScanTargetUrl(url: string, links: ProjectLink[]): string {
  const parsedTarget = normalizeToUrl(url);
  if (!parsedTarget) return url;

  const stagingHost = findLinkHostByTitle(links, STAGING_TITLE_REGEX);
  if (!stagingHost) return parsedTarget.toString();

  const liveHostFromConfig = findLinkHostByTitle(links, LIVE_TITLE_REGEX);
  const liveHost = liveHostFromConfig || parsedTarget.host.toLowerCase();
  const targetHost = parsedTarget.host.toLowerCase();

  if (liveHost === stagingHost || targetHost !== liveHost) {
    return parsedTarget.toString();
  }

  parsedTarget.host = stagingHost;
  return parsedTarget.toString();
}
