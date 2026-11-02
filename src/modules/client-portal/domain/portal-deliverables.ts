import type { ProjectLink } from '@/types';

/** One version of a deliverable as the client sees it. */
export interface PortalDeliverableVersionView {
  /** The link's id. */
  id: string;
  title: string;
  /** Always http(s). */
  url: string;
  version?: number;
  /** YYYY-MM-DD: the day it was handed over. */
  sharedAt?: string;
  /** Who on the client's side got it, by name. */
  sharedWith?: string;
}

/**
 * A file or sheet we handed over (ACT-89: a one-off data pull, a report),
 * with every version of it. `versions[0]` is the latest.
 */
export interface PortalDeliverableView {
  /** The group: the first version's link id. */
  id: string;
  versions: PortalDeliverableVersionView[];
}

const MAX_DELIVERABLES = 100;
const MAX_VERSIONS = 20;

/** The link a deliverable's versions hang off. */
export function deliverableGroupOf(link: Pick<ProjectLink, 'id' | 'deliverableId'>): string {
  return link.deliverableId?.trim() || link.id;
}

/** A link the team marked for the client: manual, switched on, with a web address. */
export function isDeliverableLink(link: ProjectLink): boolean {
  return link.source !== 'auto' && link.clientVisible === true && /^https?:\/\/\S+$/i.test(link.url?.trim() ?? '');
}

function day(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/**
 * Names only: a part that looks like an email address is left out, so a
 * pasted address never reaches the client's page.
 */
export function cleanSharedWith(value: string | undefined): string | undefined {
  const names = (value ?? '')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part && !part.includes('@'));
  const joined = [...new Set(names)].join(', ').slice(0, 200);
  return joined || undefined;
}

function versionNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 1000 ? value : undefined;
}

/** Newest first: higher version, then later day shared, then later on the Links tab. */
function newestFirst(a: ProjectLink, b: ProjectLink): number {
  return (
    (versionNumber(b.version) ?? 0) - (versionNumber(a.version) ?? 0) ||
    (day(b.sharedAt) ?? '').localeCompare(day(a.sharedAt) ?? '') ||
    (b.order ?? 0) - (a.order ?? 0)
  );
}

function toVersion(link: ProjectLink): PortalDeliverableVersionView {
  const view: PortalDeliverableVersionView = { id: link.id, title: link.title.trim() || 'Untitled', url: link.url.trim() };
  const version = versionNumber(link.version);
  if (version) view.version = version;
  const shared = day(link.sharedAt);
  if (shared) view.sharedAt = shared;
  const sharedWith = cleanSharedWith(link.sharedWith);
  if (sharedWith) view.sharedWith = sharedWith;
  return view;
}

/**
 * The project's deliverables: the manual links switched on for the client,
 * versions of one deliverable together, latest first; deliverables ordered by
 * when their latest version was shared, newest first. Only title, address,
 * version, the day and the names leave a link.
 */
export function portalDeliverables(links: readonly ProjectLink[] | undefined): PortalDeliverableView[] {
  const groups = new Map<string, ProjectLink[]>();
  for (const link of links ?? []) {
    if (!link || !isDeliverableLink(link)) continue;
    const key = deliverableGroupOf(link);
    const list = groups.get(key);
    if (list) list.push(link);
    else groups.set(key, [link]);
  }
  const all = [...groups.entries()].map(([id, members]) => {
    const sorted = [...members].sort(newestFirst);
    return { id, latest: sorted[0], versions: sorted.slice(0, MAX_VERSIONS).map(toVersion) };
  });
  all.sort(
    (a, b) =>
      (day(b.latest.sharedAt) ?? '').localeCompare(day(a.latest.sharedAt) ?? '') ||
      (a.latest.order ?? 0) - (b.latest.order ?? 0),
  );
  return all.slice(0, MAX_DELIVERABLES).map(({ id, versions }) => ({ id, versions }));
}

/** The number the next version of a deliverable gets: one more than its highest. */
export function nextDeliverableVersion(links: readonly ProjectLink[] | undefined, groupId: string): number {
  let highest = 0;
  let count = 0;
  for (const link of links ?? []) {
    if (deliverableGroupOf(link) !== groupId) continue;
    count += 1;
    highest = Math.max(highest, versionNumber(link.version) ?? 0);
  }
  return Math.max(highest, count) + 1;
}
