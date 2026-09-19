import type {
  ChecklistItem,
  ChecklistItemField,
  ChecklistItemLink,
  ChecklistItemTemplate,
  ProjectChecklist,
  SOPTemplate,
  SOPTemplateItem,
  StageRole,
} from '@/types';
import { roleOf } from './delivery.arc';

/**
 * Sending what a project learned back to the SOP it came from.
 *
 * A checklist is deep-copied onto a project so it can diverge, which is the
 * whole point — but it means the copy is one-way and every lesson dies with the
 * project. Someone works out what a step actually involves, writes it down on
 * the one project, and the next build starts from the same blank line.
 *
 * This compares a project's checklist against its source template and offers the
 * differences back. Only *how the work is done* travels: the how-to, the links,
 * whether a step gates the next stage, and the scan signal that answers it.
 * Notes, assignees, due dates and statuses stay on the project, because they are
 * facts about this build rather than about the process.
 */

/** Guidance fields, which are the only ones that belong to the process. */
export interface ItemGuidance {
  howTo?: string;
  links?: ChecklistItemLink[];
  blocking?: boolean;
  autoCheck?: ChecklistItem['autoCheck'];
  /**
   * What the step asks you to record, and the message it offers to send. Both
   * describe how the work is done, so both travel. What was actually recorded
   * — `values` — never does: that is this build, not the process.
   */
  fields?: ChecklistItemField[];
  template?: ChecklistItemTemplate;
}

export type ImprovementKind = 'changed' | 'added' | 'role';

export interface Improvement {
  /** Stable within one diff, for selection in the UI. */
  key: string;
  kind: ImprovementKind;
  sectionTitle: string;
  /** Absent for a `role` improvement, which is about the section itself. */
  itemTitle?: string;
  /** One line saying what would change, for the person deciding. */
  summary: string;
  /** What the template says today. */
  before?: ItemGuidance & { role?: StageRole };
  /** What the project says. */
  after: ItemGuidance & { role?: StageRole };
}

function sameLinks(a: ChecklistItemLink[] = [], b: ChecklistItemLink[] = []): boolean {
  if (a.length !== b.length) return false;
  return a.every((link, i) => link.url === b[i].url && link.label === b[i].label);
}

function guidanceOf(item: ChecklistItem | SOPTemplateItem): ItemGuidance {
  return {
    howTo: item.howTo?.trim() || undefined,
    links: item.links?.length ? item.links : undefined,
    blocking: item.blocking || undefined,
    autoCheck: item.autoCheck,
    fields: item.fields?.length ? item.fields : undefined,
    template: item.template?.body?.trim() ? item.template : undefined,
  };
}

/** Deep comparison by shape, which is enough for two small records of plain data. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function sameGuidance(a: ItemGuidance, b: ItemGuidance): boolean {
  return (
    (a.howTo ?? '') === (b.howTo ?? '') &&
    sameLinks(a.links, b.links) &&
    Boolean(a.blocking) === Boolean(b.blocking) &&
    a.autoCheck === b.autoCheck &&
    same(a.fields, b.fields) &&
    same(a.template, b.template)
  );
}

/** Strips the section-level `role` a role improvement carries, leaving item fields. */
function guidanceOnly(after: ItemGuidance & { role?: StageRole }): ItemGuidance {
  return {
    howTo: after.howTo,
    links: after.links,
    blocking: after.blocking,
    autoCheck: after.autoCheck,
    fields: after.fields,
    template: after.template,
  };
}

/** Says what changed in words, so nobody has to diff two objects in their head. */
function describe(before: ItemGuidance, after: ItemGuidance): string {
  const parts: string[] = [];
  if ((before.howTo ?? '') !== (after.howTo ?? '')) {
    parts.push(before.howTo ? 'a reworded how-to' : 'a how-to');
  }
  if (!sameLinks(before.links, after.links)) {
    const from = before.links?.length ?? 0;
    const to = after.links?.length ?? 0;
    parts.push(to > from ? `${to - from} more link${to - from === 1 ? '' : 's'}` : 'different links');
  }
  if (Boolean(before.blocking) !== Boolean(after.blocking)) {
    parts.push(after.blocking ? 'marked blocking' : 'no longer blocking');
  }
  if (before.autoCheck !== after.autoCheck) {
    parts.push(after.autoCheck ? 'answered by a scan' : 'no longer answered by a scan');
  }
  if (!same(before.fields, after.fields)) {
    const to = after.fields?.length ?? 0;
    parts.push(to === 0 ? 'nothing to record' : `${to} thing${to === 1 ? '' : 's'} to record`);
  }
  if (!same(before.template, after.template)) {
    parts.push(before.template ? 'a reworded message' : 'a message to send');
  }
  return parts.join(', ') || 'no visible change';
}

/**
 * Matching is by title, because instantiating a template generates fresh ids and
 * keeps no link back to the item it came from.
 *
 * The consequence is deliberate and worth knowing: rename an item on a project
 * and it stops matching, so it reads as an addition rather than an edit. That is
 * the safer way round — offering to rewrite a template item because two
 * unrelated steps happened to be reworded the same way would be worse.
 */
function byTitle<T extends { title: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    // First wins: a template with two identically titled steps is already
    // ambiguous, and quietly matching the last one would be arbitrary.
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

/**
 * What this project knows that its template does not.
 *
 * Sections the template does not have at all are skipped rather than offered:
 * adding a whole stage to an SOP is a decision about the process, made in the
 * Checklist Creator, not something to slip in from a project diff.
 */
export function improvementsFor(
  checklist: ProjectChecklist,
  template: SOPTemplate,
): Improvement[] {
  const out: Improvement[] = [];
  const templateSections = byTitle(template.sections);

  for (const section of checklist.sections ?? []) {
    const source = templateSections.get(section.title.trim().toLowerCase());
    if (!source) continue;

    const projectRole = roleOf(section);
    const templateRole = source.role ?? (source.stage as StageRole | undefined);
    if (projectRole !== templateRole) {
      out.push({
        key: `role:${section.id}`,
        kind: 'role',
        sectionTitle: section.title,
        summary: projectRole
          ? `Set this stage's role to "${projectRole}" in the template`
          : 'Clear this stage’s role in the template',
        before: { role: templateRole },
        after: { role: projectRole },
      });
    }

    const templateItems = byTitle(source.items);
    for (const item of section.items ?? []) {
      const after = guidanceOf(item);
      const sourceItem = templateItems.get(item.title.trim().toLowerCase());

      if (!sourceItem) {
        // An item somebody added while running the project. Only worth carrying
        // back when it says something; a bare title is usually a one-off.
        if (!after.howTo && !after.links?.length) continue;
        out.push({
          key: `add:${section.id}:${item.id}`,
          kind: 'added',
          sectionTitle: section.title,
          itemTitle: item.title,
          summary: 'Add this step to the template, with its guidance',
          after,
        });
        continue;
      }

      const before = guidanceOf(sourceItem);
      if (sameGuidance(before, after)) continue;

      // Guidance that was removed on the project is not an improvement to the
      // process — it usually means the step did not apply this time, which is
      // what `skipped` is for.
      if (!after.howTo && !after.links?.length && (before.howTo || before.links?.length)) continue;

      out.push({
        key: `edit:${section.id}:${item.id}`,
        kind: 'changed',
        sectionTitle: section.title,
        itemTitle: item.title,
        summary: describe(before, after),
        before,
        after,
      });
    }
  }

  return out;
}

/**
 * The template with the chosen improvements folded in.
 *
 * Returns a new template rather than mutating, and touches nothing it was not
 * asked to: an item the diff did not mention comes back byte-identical.
 */
export function applyImprovements(
  template: SOPTemplate,
  improvements: Improvement[],
): SOPTemplate {
  if (improvements.length === 0) return template;

  const bySection = new Map<string, Improvement[]>();
  for (const improvement of improvements) {
    const key = improvement.sectionTitle.trim().toLowerCase();
    bySection.set(key, [...(bySection.get(key) ?? []), improvement]);
  }

  const sections = template.sections.map((section) => {
    const forSection = bySection.get(section.title.trim().toLowerCase());
    if (!forSection?.length) return section;

    const role = forSection.find((i) => i.kind === 'role');
    const edits = new Map<string, Improvement>();
    for (const improvement of forSection) {
      if (improvement.kind === 'changed' && improvement.itemTitle) {
        edits.set(improvement.itemTitle.trim().toLowerCase(), improvement);
      }
    }

    const items: SOPTemplateItem[] = section.items.map((item) => {
      const edit = edits.get(item.title.trim().toLowerCase());
      return edit ? { ...item, ...guidanceOnly(edit.after) } : item;
    });

    for (const added of forSection) {
      if (added.kind !== 'added' || !added.itemTitle) continue;
      items.push({
        title: added.itemTitle,
        status: 'not_started',
        order: items.length,
        // `guidanceOnly` is what keeps this build's recorded values, notes and
        // assignee out of the template.
        ...guidanceOnly(added.after),
      });
    }

    return {
      ...section,
      // The deprecated tag goes whenever a role is written, or it would win on
      // the next read and undo the change.
      ...(role ? { role: role.after.role, stage: undefined } : {}),
      items: items.map((item, order) => ({ ...item, order })),
    };
  });

  return { ...template, sections };
}
