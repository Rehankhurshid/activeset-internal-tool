import type { ChecklistItemField, ProjectLink } from '@/types';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';

/**
 * Links recorded on the checklist, kept on the project's Links too.
 *
 * Rehan, 2026-10-01: "Why is MarkUp Link not automatically added here once
 * someone does it as a part of Checklist". A `url` field tagged with
 * `projectLink` (the MarkUp folder, the tracker, the walkthrough videos) is
 * mirrored onto the project, so nobody types the same link twice. The tag lives
 * on the field, in the SOP; checklists made before the tag existed borrow it
 * from the agency basics by field id.
 */

export interface WantedLink {
  title: string;
  matches: string[];
  url: string;
}

const BASICS_TAGS = new Map<string, NonNullable<ChecklistItemField['projectLink']>>(
  [AGENCY_START, AGENCY_CLOSE]
    .flatMap((section) => section.items)
    .flatMap((item) => item.fields ?? [])
    .filter((field) => field.projectLink)
    .map((field) => [field.id, field.projectLink!]),
);

const isHttp = (value: string) => /^https?:\/\/\S+$/i.test(value);

/** The project links that recording `values` on an item with these `fields` asks for. */
export function linksFromValues(
  fields: readonly ChecklistItemField[] | undefined,
  values: Record<string, string>,
): WantedLink[] {
  const wanted: WantedLink[] = [];
  for (const field of fields ?? []) {
    if (field.type !== 'url') continue;
    const tag = field.projectLink ?? BASICS_TAGS.get(field.id);
    const url = values[field.id]?.trim();
    if (!tag || !url || !isHttp(url)) continue;
    wanted.push({ title: tag.title, matches: tag.matches ?? [], url });
  }
  return wanted;
}

const norm = (title: string) => title.trim().toLowerCase();

/**
 * Puts each wanted link on the project: an existing link with that title (or
 * one of its other names) gets the new address; otherwise a new manual link is
 * added at the end. Returns the ids it touched; an empty list means nothing changed.
 */
export function mergeProjectLinks(
  links: readonly ProjectLink[],
  wanted: readonly WantedLink[],
  newId: () => string,
): { links: ProjectLink[]; changed: string[] } {
  const next = links.map((link) => ({ ...link }));
  const changed: string[] = [];
  for (const want of wanted) {
    const names = new Set([want.title, ...want.matches].map(norm));
    const existing = next.find((link) => link.source !== 'auto' && names.has(norm(link.title)));
    if (existing) {
      if (existing.url?.trim() !== want.url) {
        existing.url = want.url;
        changed.push(existing.id);
      }
      continue;
    }
    const link: ProjectLink = {
      id: newId(),
      title: want.title,
      url: want.url,
      order: next.reduce((max, l) => Math.max(max, l.order ?? 0), -1) + 1,
      source: 'manual',
    };
    next.push(link);
    changed.push(link.id);
  }
  return { links: next, changed };
}
