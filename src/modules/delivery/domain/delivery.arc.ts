import type {
  ChecklistItem,
  ChecklistSection,
  ProjectChecklist,
  StageRole,
} from '@/types';

/**
 * The delivery arc: a project's whole run, start to end, read off its own SOP.
 *
 * Every section of the project's checklist is a stage, in the order the SOP puts
 * them. That is what makes this work for any SOP — a Webflow build's eleven
 * steps and a brand project's nine phases are the same machinery, and a new SOP
 * needs no code. It also fixes what was wrong before: the Delivery tab knew
 * about two ends of the process and rendered four of eleven sections, so most of
 * what the team actually does had nowhere to live.
 *
 * The app hardcodes only {@link StageRole} — the few stages where it does
 * something beyond listing items.
 */

/** A stage in the arc. Either a section of the SOP, or the page grid. */
export type ArcEntry = SectionStage | PagesStage;

export interface StageBase {
  /** Stable across reorders and renames; what the UI selects on. */
  key: string;
  title: string;
  emoji?: string;
  role?: StageRole;
  /** Position in the arc, counting from 1, for "step 3 of 11". */
  position: number;
}

export interface SectionStage extends StageBase {
  kind: 'section';
  checklistId: string;
  checklistName: string;
  section: ChecklistSection;
  items: ChecklistItem[];
  progress: StageProgress;
}

/**
 * The page grid, which is not a checklist section because the checklist model
 * has no page axis and cannot ask one question of 26 pages.
 */
export interface PagesStage extends StageBase {
  kind: 'pages';
  role: 'pages';
}

export interface StageProgress {
  done: number;
  /** Excludes items deliberately skipped — the checklist's "not applicable". */
  total: number;
  skipped: number;
  outstanding: string[];
  /** Outstanding items marked as gating the stage. */
  blocking: string[];
  complete: boolean;
}

/**
 * A section's role, tolerating the tag that came before it.
 *
 * Projects tagged before roles existed carry `stage: 'kickoff' | 'launch'`, and
 * those mean exactly the roles of the same name, so they are read rather than
 * migrated. Nobody has to re-tag a live project.
 */
export function roleOf(section: ChecklistSection): StageRole | undefined {
  if (section.role) return section.role;
  if (section.stage === 'kickoff') return 'kickoff';
  if (section.stage === 'launch') return 'launch';
  return undefined;
}

function progressOf(items: ChecklistItem[]): StageProgress {
  let done = 0;
  let skipped = 0;
  const outstanding: string[] = [];
  const blocking: string[] = [];

  for (const item of items) {
    if (item.status === 'completed') done += 1;
    else if (item.status === 'skipped') skipped += 1;
    else {
      outstanding.push(item.title);
      if (item.blocking) blocking.push(item.title);
    }
  }

  return {
    done,
    total: items.length - skipped,
    skipped,
    outstanding,
    blocking,
    complete: items.length > 0 && outstanding.length === 0,
  };
}

/** Sections of one checklist in their own order, with their items sorted too. */
function sectionStages(checklist: ProjectChecklist): Omit<SectionStage, 'position'>[] {
  return [...(checklist.sections ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const items = [...(section.items ?? [])].sort((a, b) => a.order - b.order);
      return {
        kind: 'section' as const,
        key: `${checklist.id}:${section.id}`,
        title: section.title,
        emoji: section.emoji,
        role: roleOf(section),
        checklistId: checklist.id,
        checklistName: checklist.templateName,
        section,
        items,
        progress: progressOf(items),
      };
    });
}

/**
 * Where the page grid goes when no section claims it.
 *
 * A website project whose SOP never says "the build happens here" still builds
 * pages, so the grid still appears. It sits after the last kickoff stage, which
 * is where a build starts, and failing that second — after the first stage,
 * never before it, because the first stage is what the client owes us.
 */
function defaultPagesIndex(stages: Omit<SectionStage, 'position'>[]): number {
  let lastKickoff = -1;
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i].role === 'kickoff') lastKickoff = i;
  }
  if (lastKickoff >= 0) return lastKickoff + 1;
  return Math.min(1, stages.length);
}

export interface ArcOptions {
  /**
   * Whether this project builds pages at all. A brand project has no page axis,
   * and showing it an empty grid would be noise. Defaults to true because every
   * project in this app is a website build until a stack says otherwise.
   */
  includePages?: boolean;
}

/**
 * The whole arc, in order, across every checklist on the project.
 *
 * The page grid is spliced in: into the stage that claims the `pages` role, or
 * as its own entry when none does.
 */
export function deliveryArc(
  checklists: ProjectChecklist[],
  { includePages = true }: ArcOptions = {},
): ArcEntry[] {
  const stages = checklists.flatMap(sectionStages);
  const claimsPages = stages.some((stage) => stage.role === 'pages');

  const entries: Omit<ArcEntry, 'position'>[] = [...stages];
  if (includePages && !claimsPages) {
    entries.splice(defaultPagesIndex(stages), 0, {
      kind: 'pages',
      key: 'pages',
      title: 'Pages',
      role: 'pages',
    });
  }

  return entries.map((entry, index) => ({ ...entry, position: index + 1 }) as ArcEntry);
}

/** The first stage playing a role, which is where that role's extras render. */
export function stageWithRole(arc: ArcEntry[], role: StageRole): ArcEntry | undefined {
  return arc.find((entry) => entry.role === role);
}

/** Only the SOP sections, for anything that counts items rather than stages. */
export function sectionStagesOf(arc: ArcEntry[]): SectionStage[] {
  return arc.filter((entry): entry is SectionStage => entry.kind === 'section');
}

/**
 * Items of every stage playing a role. Replaces the old per-stage lookups, which
 * could only ask about kickoff and launch.
 */
export function itemsWithRole(checklists: ProjectChecklist[], role: StageRole): ChecklistItem[] {
  return sectionStagesOf(deliveryArc(checklists))
    .filter((stage) => stage.role === role)
    .flatMap((stage) => stage.items);
}

export interface RoleProgress extends StageProgress {
  /** No section plays this role, which is not the same as nothing to do. */
  untagged: boolean;
}

/**
 * How far every stage with a given role has got, taken together.
 *
 * `untagged` matters: a project whose SOP marks no launch stage has not finished
 * launching, it simply has not said where launching happens, and the UI needs to
 * say so rather than showing a triumphant 0 of 0.
 */
export function roleProgress(checklists: ProjectChecklist[], role: StageRole): RoleProgress {
  const stages = sectionStagesOf(deliveryArc(checklists)).filter((stage) => stage.role === role);
  const progress = progressOf(stages.flatMap((stage) => stage.items));
  return {
    ...progress,
    complete: stages.length > 0 && progress.outstanding.length === 0,
    untagged: stages.length === 0,
  };
}

/**
 * How far the whole project has got: every item of every stage.
 *
 * This is the number that belongs on the Delivery tab, because it is the only
 * one that covers the SOP rather than the two ends of it.
 */
export function arcProgress(checklists: ProjectChecklist[]): StageProgress {
  return progressOf(sectionStagesOf(deliveryArc(checklists)).flatMap((stage) => stage.items));
}

/**
 * The stage to open on first arrival: the earliest one not finished.
 *
 * Deliberately the earliest rather than the furthest along, because an
 * unfinished early stage is usually the thing holding everything else up.
 */
export function currentStageKey(arc: ArcEntry[]): string | undefined {
  const unfinished = arc.find((entry) => entry.kind === 'section' && !entry.progress.complete);
  return (unfinished ?? arc[0])?.key;
}

/**
 * Whether a stage is open for work, and why not when it is closed.
 *
 * A stage opens when every blocking item before it is settled. Stages with no
 * blocking items never gate anything, so a team that has not marked anything as
 * blocking sees the arc behave exactly as it did before — the gate is opt-in,
 * one item at a time.
 */
export function gateFor(arc: ArcEntry[], key: string): { open: boolean; waitingOn: string[] } {
  const index = arc.findIndex((entry) => entry.key === key);
  if (index <= 0) return { open: true, waitingOn: [] };

  const waitingOn = arc
    .slice(0, index)
    .flatMap((entry) => (entry.kind === 'section' ? entry.progress.blocking : []));

  return { open: waitingOn.length === 0, waitingOn };
}
