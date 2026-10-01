import type { ClientTimelineSettings, ProjectChecklist, ProjectTimeline } from '@/types';
import { checklistProcess, followChecklist, type ChecklistProcessOptions } from './checklist-process';
import { timelineStages, type TimelineStageSource } from './client-timeline';
import { sheetStageSources } from './project-sheet.portal';
import type { SheetStagesFrom, SheetTimeline } from './project-sheet.types';

/**
 * Where the client's stages come from, decided in one place so the client's
 * page and the team's Client tab can never disagree about it.
 *
 * 1. The project sheet's Process (or Timeline) tab, unless the team chose the
 *    app's Timeline instead. Its steps move with the checklist where they share
 *    a name with a checklist step.
 * 2. The checklist, when its SOP says what the client sees: labels on the
 *    checklist itself, or borrowed from the SOP it was made from (Rehan,
 *    2026-10-01: the stage is the checklist's to manage, not ours by hand).
 * 3. The Timeline tab, when it has milestones.
 * 4. Otherwise nothing here, and the client plan drives the page.
 */

export type StageSourceKind = 'sheet' | 'checklist' | 'timeline';

export interface PortalSourcesInput {
  checklists?: readonly Pick<ProjectChecklist, 'sections' | 'templateId' | 'templateIds' | 'createdAt'>[];
  /** For the labels of checklists made before SOPs carried them. */
  templates?: ChecklistProcessOptions['templates'];
  agency?: ChecklistProcessOptions['agency'];
  sheetTimeline?: SheetTimeline;
  stagesFrom?: SheetStagesFrom;
  timeline?: Pick<ProjectTimeline, 'phases' | 'milestones'> | null;
  timelineSettings?: ClientTimelineSettings;
}

export interface PortalSources {
  /** What drives the stages. Null means the client plan does. */
  kind: StageSourceKind | null;
  sources: TimelineStageSource[];
  /** The checklist's process, labels from the SOPs included. */
  process: TimelineStageSource[];
  /** With a sheet: how many of its steps the checklist moves, and which it does not. */
  followed: number;
  unmatched: string[];
}

export function portalStageSources(input: PortalSourcesInput): PortalSources {
  const checklists = input.checklists ?? [];
  const process = checklistProcess(checklists, { templates: input.templates, agency: input.agency });
  const app = timelineStages(input.timeline, input.timelineSettings);
  const sheetRaw = sheetStageSources(input.sheetTimeline);
  const followedSheet = process.length > 0 ? followChecklist(sheetRaw, process) : { sources: sheetRaw, followed: 0, unmatched: [] };

  const fromSheet = sheetRaw.length > 0 && !(input.stagesFrom === 'app' && app.length > 0);
  if (fromSheet) {
    return { kind: 'sheet', sources: followedSheet.sources, process, followed: followedSheet.followed, unmatched: followedSheet.unmatched };
  }
  if (process.length > 0) return { kind: 'checklist', sources: process, process, followed: 0, unmatched: [] };
  if (app.length > 0) return { kind: 'timeline', sources: app, process, followed: 0, unmatched: [] };
  return { kind: null, sources: [], process, followed: 0, unmatched: [] };
}
