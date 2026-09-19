import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import type { ChecklistItem, ChecklistSection, ProjectChecklist, SOPTemplateItem } from '@/types';

/**
 * Putting the agency's own routine onto a project that does not have it.
 *
 * Getting the client into Slack, the welcome email, the cadence, the walkthrough
 * at the end: the same for every engagement, and defined once in
 * `src/lib/sop-templates.ts`. New checklists get them at creation.
 *
 * Every project created before that, and every project running from a template
 * somebody wrote themselves, has a checklist that never saw them — a checklist
 * is a deep copy, so changing how new ones are made does nothing for the ones
 * already running. This is how those catch up.
 *
 * Nothing is added silently. A project that already does these steps almost
 * certainly words them differently — "Create Slack Channel with Client" against
 * "Create the shared Slack channel with the client" — and no title match is
 * going to spot that reliably. So this works out what is *probably* missing and
 * the person decides, which is the only way that ends up right.
 */

/** Where a missing step would go, and what it is. */
export interface MissingBasic {
  /** Stable within one gap, for selection in the UI. */
  key: string;
  /** The section it belongs to: the start of the project, or the close. */
  placement: 'start' | 'close';
  sectionTitle: string;
  item: SOPTemplateItem;
  /**
   * An existing step whose title looks like this one. A hint for the person
   * deciding, never a reason to skip it automatically.
   */
  resembles?: string;
  /**
   * The resemblance is strong enough that this is probably the same step. The
   * only case where the UI should start it unticked.
   */
  likelyDuplicate?: boolean;
}

export interface BasicsGap {
  missing: MissingBasic[];
  /** Titles the checklist already carries verbatim, so they are never offered. */
  alreadyPresent: string[];
}

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words that carry no signal when comparing two step titles. */
const NOISE = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'with', 'from', 'on', 'in',
  'at', 'by', 'as', 'is', 'it', 'this', 'that', 'client', 'project', 'we', 'our',
]);

function keywords(title: string): Set<string> {
  return new Set(normalize(title).split(' ').filter((w) => w.length > 2 && !NOISE.has(w)));
}

/**
 * How much two titles look like the same step, 0 to 1.
 *
 * Shared words over all the words, not over the shorter title. Dividing by the
 * shorter one scores any short title highly against anything containing it:
 * "Hold the kickoff call" came out 0.67 against "Book the kickoff call as soon
 * as the deal closes", which are two different steps, and one of them gates the
 * whole project.
 */
function similarity(a: string, b: string): number {
  const left = keywords(a);
  const right = keywords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

/**
 * Two thresholds, because the two mistakes cost very different amounts.
 *
 * Failing to add a standard step is the exact problem this whole thing exists to
 * fix, and it is invisible — nobody notices the welcome email that was never on
 * the list. Adding one that turns out to be a duplicate costs a few seconds to
 * delete. So a weak resemblance is shown and still ticked, and only something
 * that is almost certainly the same step starts unticked.
 *
 * A step the checklist already carries word for word is not offered at all, so
 * the genuine duplicate case never reaches either of these.
 */
const RESEMBLES_AT = 0.5;
const LIKELY_DUPLICATE_AT = 0.8;

/**
 * What this checklist is missing from the agency basics.
 *
 * A step already present verbatim is not offered at all. One that merely looks
 * similar is offered with the resemblance named, because the wording on the
 * project may be the better one and only a person can say.
 */
export function basicsGap(checklist: ProjectChecklist): BasicsGap {
  const existing = (checklist.sections ?? []).flatMap((section) =>
    (section.items ?? []).map((item) => item.title),
  );
  const exact = new Set(existing.map(normalize));

  const missing: MissingBasic[] = [];
  const alreadyPresent: string[] = [];

  const consider = (placement: 'start' | 'close', section: typeof AGENCY_START) => {
    for (const item of section.items) {
      if (exact.has(normalize(item.title))) {
        alreadyPresent.push(item.title);
        continue;
      }

      let resembles: string | undefined;
      let best = RESEMBLES_AT;
      for (const candidate of existing) {
        const score = similarity(item.title, candidate);
        if (score >= best) {
          best = score;
          resembles = candidate;
        }
      }

      missing.push({
        key: `${placement}:${normalize(item.title)}`,
        placement,
        sectionTitle: section.title,
        item,
        ...(resembles ? { resembles } : {}),
        ...(resembles && best >= LIKELY_DUPLICATE_AT ? { likelyDuplicate: true } : {}),
      });
    }
  };

  consider('start', AGENCY_START);
  consider('close', AGENCY_CLOSE);

  return { missing, alreadyPresent };
}

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_basics_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/**
 * The checklist's sections with the chosen steps folded in.
 *
 * The start section goes to the front and the close to the end, because that is
 * what they are. If a section of that name already exists the steps join it
 * rather than creating a second one, so running this twice does not leave a
 * project with two "Start: client setup" stages.
 */
export function sectionsWithBasics(
  sections: ChecklistSection[],
  chosen: MissingBasic[],
): ChecklistSection[] {
  if (chosen.length === 0) return sections;

  const next = sections.map((section) => ({ ...section, items: [...(section.items ?? [])] }));

  const place = (placement: 'start' | 'close', template: typeof AGENCY_START) => {
    const items = chosen.filter((c) => c.placement === placement);
    if (items.length === 0) return;

    const asChecklistItems: ChecklistItem[] = items.map((missing, i) => ({
      ...missing.item,
      id: newId('item'),
      status: 'not_started',
      order: i,
    }));

    const existingIndex = next.findIndex((s) => normalize(s.title) === normalize(template.title));
    if (existingIndex >= 0) {
      const section = next[existingIndex];
      section.items = [...section.items, ...asChecklistItems].map((item, order) => ({ ...item, order }));
      return;
    }

    const section: ChecklistSection = {
      id: newId('sec'),
      title: template.title,
      emoji: template.emoji,
      role: template.role,
      order: 0,
      items: asChecklistItems,
    };
    if (placement === 'start') next.unshift(section);
    else next.push(section);
  };

  place('start', AGENCY_START);
  place('close', AGENCY_CLOSE);

  return next.map((section, order) => ({ ...section, order }));
}

/**
 * The basics as sections, for a checklist being created from scratch.
 *
 * Used by `createChecklist`, where there is nothing to compare against and every
 * step is new — so this is the simple case, with none of the guessing above.
 */
export function agencyBasicsFor(sections: ChecklistSection[]): ChecklistSection[] {
  const seen = new Set(
    sections.flatMap((section) => (section.items ?? []).map((item) => normalize(item.title))),
  );

  const build = (template: typeof AGENCY_START): ChecklistSection | null => {
    // A template that already spells out one of these keeps its own wording.
    const items = template.items.filter((item) => !seen.has(normalize(item.title)));
    if (items.length === 0) return null;
    return {
      id: newId('sec'),
      title: template.title,
      emoji: template.emoji,
      role: template.role,
      order: 0,
      items: items.map((item, order) => ({ ...item, id: newId('item'), status: 'not_started' as const, order })),
    };
  };

  const start = build(AGENCY_START);
  const close = build(AGENCY_CLOSE);

  return [...(start ? [start] : []), ...sections, ...(close ? [close] : [])].map(
    (section, order) => ({ ...section, order }),
  );
}
