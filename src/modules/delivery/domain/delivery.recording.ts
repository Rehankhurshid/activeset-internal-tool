/**
 * A video of each page: one eased scroll at a time, at 60 fps.
 *
 * The worker machine records it (a real browser, frame by frame, so the motion
 * is smooth however slow the capture is) and writes the result back onto the
 * page document. This file is the part both sides need: which URL a page is
 * recorded from, and what the page document says about its video.
 */
import type { ProjectLink } from '@/types';

export type RecordingSource = 'staging' | 'live';

export type RecordingStatus = 'queued' | 'recording' | 'done' | 'failed';

/** On `projects/{id}/pages/{pageId}` as `recording`. The worker owns every field after `queued`. */
export interface PageRecording {
  status: RecordingStatus;
  source: RecordingSource;
  /** The address that was (or is being) recorded. */
  sourceUrl: string;
  jobId?: string;
  requestedBy?: string;
  requestedAt: string;
  /** 0–1 while recording. */
  progress?: number;
  videoUrl?: string;
  posterUrl?: string;
  /** Storage paths, so a re-record can remove the video it replaces. */
  videoPath?: string;
  posterPath?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  bytes?: number;
  recordedAt?: string;
  error?: string;
}

export const RECORDING_SOURCE_LABEL: Record<RecordingSource, string> = {
  staging: 'Staging',
  live: 'Live',
};

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

function joinPath(origin: string, path: string): string {
  const clean = path.trim();
  if (!clean || clean === '/') return `${origin}/`;
  return `${origin}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

/** Same matching the sitemap scan uses to find a project's staging and live links. */
const STAGING_TITLE = /\bstag(?:e|ing|nging)\b/i;
const LIVE_TITLE = /\blive\b/i;

/** Hand-added links only: a sitemap page titled "Live demo" is not the live site. */
function linkByTitle(links: readonly ProjectLink[], pattern: RegExp): ProjectLink | undefined {
  return links.find((link) => link.source !== 'auto' && pattern.test(link.title ?? '') && !!link.url?.trim());
}

export interface RecordingTargets {
  staging?: string;
  live?: string;
}

/**
 * Where this page can be recorded from.
 *
 * Staging: the page's own staging link, else the project's "Staging" link with
 * the page's path on it. Live: the project's "Live" link, else the sitemap's
 * site, with the path. A path that is already a full URL (sheet imports store
 * them that way) stands in for staging when there is no staging link.
 */
export function recordingTargets(
  page: { path: string; stagingLink?: string },
  project: { links?: readonly ProjectLink[]; sitemapUrl?: string },
): RecordingTargets {
  const links = project.links ?? [];
  const pathIsUrl = isHttpUrl(page.path);
  const path = pathIsUrl ? new URL(page.path.trim()).pathname : page.path;
  const targets: RecordingTargets = {};

  if (isHttpUrl(page.stagingLink)) targets.staging = page.stagingLink.trim();
  else if (pathIsUrl) targets.staging = page.path.trim();
  else {
    const origin = originOf(linkByTitle(links, STAGING_TITLE)?.url);
    if (origin) targets.staging = joinPath(origin, path);
  }

  const liveOrigin = originOf(linkByTitle(links, LIVE_TITLE)?.url) ?? originOf(project.sitemapUrl);
  if (liveOrigin) {
    const live = joinPath(liveOrigin, path);
    if (live !== targets.staging) targets.live = live;
  }

  return targets;
}

/**
 * Whether the worker may open this address.
 *
 * Anyone on the team can queue a recording, and the worker sits on the office
 * network and publishes what it sees to a public CDN. So nothing on that
 * network: no localhost, no private or link-local ranges, no bare hostnames.
 */
export function recordableUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Not a valid address';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http and https pages can be recorded';
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return 'Only public sites can be recorded';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'Only public sites can be recorded';
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
      return 'Only public sites can be recorded';
    }
  }
  if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) {
    return 'Only public sites can be recorded';
  }
  return null;
}

export function isRecordingBusy(recording: PageRecording | undefined): boolean {
  return recording?.status === 'queued' || recording?.status === 'recording';
}
