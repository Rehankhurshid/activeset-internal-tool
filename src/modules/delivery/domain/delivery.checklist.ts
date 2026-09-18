import type { ChecklistItem, ChecklistSection, ChecklistStage, ProjectChecklist } from '@/types';

/**
 * Reading the project's own checklist as a delivery stage.
 *
 * Kickoff and the site-wide launch list are sections of the project's checklist,
 * not lists held in this module. That is what lets two projects differ: the
 * team edits the checklist on that project, or edits the template it came from,
 * and the Delivery stages follow. The Checklist tab and the Delivery stages tick
 * the same underlying item.
 */

/** One section, with the checklist it belongs to, so a tick knows where to write. */
export interface StageSection {
  checklistId: string;
  checklistName: string;
  section: ChecklistSection;
}

/**
 * Every section tagged for a stage, across all of the project's checklists.
 *
 * Ordered by checklist, then by the section's own order, so the sequence a team
 * sees matches the SOP they wrote rather than Firestore's document order.
 */
export function sectionsForStage(checklists: ProjectChecklist[], stage: ChecklistStage): StageSection[] {
  const out: StageSection[] = [];
  for (const checklist of checklists) {
    const tagged = [...(checklist.sections ?? [])]
      .filter((s) => s.stage === stage)
      .sort((a, b) => a.order - b.order);
    for (const section of tagged) {
      out.push({ checklistId: checklist.id, checklistName: checklist.templateName, section });
    }
  }
  return out;
}

/** Flattens a stage's sections to their items, for counting. */
export function itemsForStage(checklists: ProjectChecklist[], stage: ChecklistStage): ChecklistItem[] {
  return sectionsForStage(checklists, stage).flatMap((s) => [...(s.section.items ?? [])].sort((a, b) => a.order - b.order));
}

export interface StageProgress {
  done: number;
  /** Excludes items deliberately skipped — the checklist's "not applicable". */
  total: number;
  skipped: number;
  outstanding: string[];
  complete: boolean;
  /** No section is tagged for this stage, which is not the same as nothing to do. */
  untagged: boolean;
}

/**
 * How far a stage has got.
 *
 * `untagged` matters: a project whose checklist has no section marked for this
 * stage has not finished it, it simply has not been set up, and the UI needs to
 * say so rather than showing a triumphant 0/0.
 */
export function stageProgress(checklists: ProjectChecklist[], stage: ChecklistStage): StageProgress {
  const sections = sectionsForStage(checklists, stage);
  const items = sections.flatMap((s) => s.section.items ?? []);

  let done = 0;
  let skipped = 0;
  const outstanding: string[] = [];
  for (const item of items) {
    if (item.status === 'completed') done += 1;
    else if (item.status === 'skipped') skipped += 1;
    else outstanding.push(item.title);
  }

  const total = items.length - skipped;
  return {
    done,
    total,
    skipped,
    outstanding,
    complete: sections.length > 0 && outstanding.length === 0,
    untagged: sections.length === 0,
  };
}
