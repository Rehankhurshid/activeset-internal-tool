/**
 * Going live, for the page tracker (Linear ACT-94, from Different AI).
 *
 * Two things went wrong after that launch. The client's page links still
 * pointed at `*.webflow.io`, because nobody rewrites twenty links by hand; and
 * pages built late (Careers, Contact, VDP) were never added to the tracker, so
 * the client never saw them. This file is the pure part of both fixes:
 *
 * - `launchPlan`: which page links "Mark launched" would move to the live
 *   domain, keeping each path, so the team sees the change before it is made.
 * - `sitemapGap`: which static pages the live sitemap lists that no tracker row
 *   has, leaving out CMS items and what the team chose to ignore.
 *
 * Nothing here knows which project it is looking at: the live domain comes from
 * the project's own settings, never from a list in code.
 */
import type { FolderPageTypes, ProjectLink } from '@/types';
import type { ProjectDeliveryState, ProjectPage } from './delivery.types';

/** Hosts that only ever serve a build in progress, never the client's site. */
const STAGING_HOST = /\.(webflow\.io|framer\.app|framer\.website|vercel\.app|netlify\.app|pages\.dev)$/i;

export function isStagingHost(host: string): boolean {
  return STAGING_HOST.test(host.trim().toLowerCase());
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * `acme.com`, `https://acme.com/`, `https://acme.com/sitemap.xml` → `https://acme.com`.
 * Null for anything that is not an http(s) address with a dotted host.
 */
export function liveOriginOf(input: string | undefined | null): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const LIVE_TITLE = /\blive\b/i;

/**
 * Where the live site most likely is, for the dialog to start from: the launch
 * already recorded, the Webflow custom domain, a hand-added link titled "Live",
 * then the saved sitemap's site, unless that is a staging host. The team can
 * always type another.
 */
export function suggestLiveOrigin(project: {
  delivery?: Pick<ProjectDeliveryState, 'launch'>;
  webflowConfig?: { customDomain?: string };
  links?: readonly ProjectLink[];
  sitemapUrl?: string;
}): string | undefined {
  const recorded = liveOriginOf(project.delivery?.launch?.liveOrigin);
  if (recorded) return recorded;
  const custom = liveOriginOf(project.webflowConfig?.customDomain);
  if (custom) return custom;
  const liveLink = (project.links ?? []).find(
    (l) => l.source !== 'auto' && LIVE_TITLE.test(l.title ?? '') && !!l.url?.trim(),
  );
  const fromLink = liveOriginOf(liveLink?.url);
  if (fromLink && !isStagingHost(new URL(fromLink).hostname)) return fromLink;
  const fromSitemap = liveOriginOf(project.sitemapUrl);
  if (fromSitemap && !isStagingHost(new URL(fromSitemap).hostname)) return fromSitemap;
  return undefined;
}

/** A tracker row's path as a path, even when a sheet import stored a full URL. */
function pagePathOf(page: Pick<ProjectPage, 'path'>): string {
  const raw = page.path?.trim() || '/';
  if (isHttpUrl(raw)) return new URL(raw).pathname || '/';
  const path = raw.split('?')[0].split('#')[0];
  return path.startsWith('/') ? path : `/${path}`;
}

export interface LaunchChange {
  pageId: string;
  title: string;
  /** Absent when the page had no link and is being given one. */
  from?: string;
  to: string;
}

export interface LaunchPlan {
  liveOrigin: string;
  /** Links on another host, moved to the live one with the same path. */
  rewrites: LaunchChange[];
  /** Pages with no link at all, given the live page at their path. */
  unlinked: LaunchChange[];
  /** Links already on the live host. */
  alreadyLive: number;
  /** The hosts the rewrites move off, for the record. */
  fromHosts: string[];
}

/**
 * What "Mark launched" would change, page by page and in the grid's order.
 * Every link that is not on the live host moves to it with its path, query and
 * fragment kept; a link already there is left alone.
 */
export function launchPlan(
  pages: readonly Pick<ProjectPage, 'id' | 'title' | 'path' | 'order' | 'stagingLink'>[],
  liveOrigin: string,
): LaunchPlan {
  const origin = liveOriginOf(liveOrigin);
  if (!origin) throw new Error('That is not a web address');
  const liveHost = new URL(origin).host.toLowerCase();
  const plan: LaunchPlan = { liveOrigin: origin, rewrites: [], unlinked: [], alreadyLive: 0, fromHosts: [] };
  const hosts = new Set<string>();

  for (const page of [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const title = page.title?.trim() || page.path;
    const link = page.stagingLink?.trim();
    if (link && isHttpUrl(link)) {
      const url = new URL(link);
      if (url.host.toLowerCase() === liveHost) {
        plan.alreadyLive += 1;
        continue;
      }
      hosts.add(url.host.toLowerCase());
      plan.rewrites.push({ pageId: page.id, title, from: link, to: `${origin}${url.pathname}${url.search}${url.hash}` });
      continue;
    }
    plan.unlinked.push({ pageId: page.id, title, to: `${origin}${pagePathOf(page)}` });
  }

  plan.fromHosts = [...hosts].sort();
  return plan;
}

// --- The live sitemap against the tracker ----------------------------------

/** Lowercased path, no trailing slash, `/` for the home page: how two addresses are compared. */
export function sitemapPathKey(input: string): string {
  let path = input.trim();
  if (isHttpUrl(path)) path = new URL(path).pathname;
  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.toLowerCase().replace(/\/+$/, '');
  return path || '/';
}

/**
 * `/blog/*` matches what is under `/blog`, not `/blog` itself: a collection's
 * items are CMS, its listing page is a page someone builds. An entry without
 * the wildcard is one exact path.
 */
function underPattern(path: string, pattern: string): boolean {
  const pat = sitemapPathKey(pattern.replace(/\/\*$/, ''));
  if (!pattern.trim().endsWith('/*')) return path === pat;
  return pat === '/' ? path !== '/' : path.startsWith(`${pat}/`);
}

/**
 * The folders whose pages are CMS items, from what the app already knows: the
 * project's folder types and the page types the sitemap scan recorded on its
 * links. A sitemap lists every blog post; the tracker has one template for them.
 */
export function cmsFoldersOf(project: { folderPageTypes?: FolderPageTypes; links?: readonly ProjectLink[] }): string[] {
  const folders = new Set<string>();
  for (const [pattern, type] of Object.entries(project.folderPageTypes ?? {})) {
    if (type === 'collection' && pattern.trim().endsWith('/*')) folders.add(pattern.trim().toLowerCase());
  }
  for (const link of project.links ?? []) {
    if (link.pageType !== 'collection' || !isHttpUrl(link.url)) continue;
    const segments = sitemapPathKey(link.url).split('/').filter(Boolean);
    if (segments.length >= 2) folders.add(`/${segments.slice(0, -1).join('/')}/*`);
  }
  return [...folders].sort();
}

export interface SitemapGapResult {
  missing: { path: string; url: string }[];
  cmsSkipped: number;
  sitemapCount: number;
}

/**
 * The static pages the sitemap lists that are not on the tracker. A row counts
 * as covering a page by its path or by the path of its link, so a row whose
 * path is a slug and whose link is the real page still matches.
 */
export function sitemapGap(
  sitemapUrls: readonly string[],
  pages: readonly Pick<ProjectPage, 'path' | 'stagingLink'>[],
  options: { cmsFolders?: readonly string[]; ignore?: readonly string[] } = {},
): SitemapGapResult {
  const tracked = new Set<string>();
  for (const page of pages) {
    tracked.add(sitemapPathKey(page.path || '/'));
    if (page.stagingLink && isHttpUrl(page.stagingLink)) tracked.add(sitemapPathKey(page.stagingLink));
  }
  const cms = options.cmsFolders ?? [];
  const ignore = options.ignore ?? [];

  const seen = new Set<string>();
  const missing: { path: string; url: string }[] = [];
  let cmsSkipped = 0;
  for (const raw of sitemapUrls) {
    if (!isHttpUrl(raw)) continue;
    const path = sitemapPathKey(raw);
    if (seen.has(path)) continue;
    seen.add(path);
    if (cms.some((folder) => underPattern(path, folder))) {
      cmsSkipped += 1;
      continue;
    }
    if (tracked.has(path) || ignore.some((pattern) => underPattern(path, pattern))) continue;
    missing.push({ path, url: raw.trim() });
  }

  missing.sort((a, b) => a.path.localeCompare(b.path));
  return { missing, cmsSkipped, sitemapCount: seen.size };
}

/** The gap as the team should see it now: without what was added or ignored since it was checked. */
export function openSitemapGap(
  gap: Pick<SitemapGapResult, 'missing'> | undefined,
  pages: readonly Pick<ProjectPage, 'path' | 'stagingLink'>[],
  ignore: readonly string[] = [],
): { path: string; url: string }[] {
  if (!gap?.missing?.length) return [];
  return sitemapGap(
    gap.missing.map((m) => m.url),
    pages,
    { ignore },
  ).missing;
}

/** Folders with several missing pages, so the team can ignore one at once ("/blog/*"). */
export function gapFolders(missing: readonly { path: string }[], min = 3): { pattern: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { path } of missing) {
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) continue;
    const pattern = `/${segments.slice(0, -1).join('/')}/*`;
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= min)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
}

/** "/careers/open-roles" → "Open Roles"; the tracker's own `titleFromPath` lives in the repository. */
export function titleForSitemapPath(path: string): string {
  const last = sitemapPathKey(path).split('/').filter(Boolean).pop();
  if (!last) return 'Homepage';
  let word = last;
  try {
    word = decodeURIComponent(last);
  } catch {
    // A malformed escape: the slug as it is reads well enough.
  }
  return word
    .replace(/[-_]+/g, ' ')
    .replace(/\.[a-z]+$/i, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
