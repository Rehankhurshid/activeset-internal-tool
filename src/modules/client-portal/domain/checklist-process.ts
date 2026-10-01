import type {
  ChecklistItem,
  ChecklistSection,
  ClientStepWho,
  ProjectChecklist,
  SOPTemplate,
  SOPTemplateItem,
  SOPTemplateSection,
} from '@/types';
import { SERVICE_LABELS, isServiceId } from '@/lib/engagements';
import { isIsoDay, type PlanStageState } from './client-plan';
import type { TimelineStageSource, TimelineStep } from './client-timeline';

/**
 * The client's process, read off the checklist the team ticks.
 *
 * Rehan's call, 2026-10-01: the Checklist is the one place the team marks
 * progress, and the client's page follows it. An SOP says what the client sees
 * of it: a section is a step ("Moodboarding"), and an item inside one can be a
 * step of its own ("Feedback on moodboard", the client's). Everything else on
 * the checklist stays internal. A step is done when every item in it is, on the
 * day the last one was ticked, so "Moodboarding · Done · 12 Oct" needs nobody
 * to type a date. A client's step that is in progress is waiting on them.
 *
 * Checklists made before SOPs carried these labels have none of their own, so
 * the labels can also come from the SOP the checklist was made from, matched by
 * section and item title. That is how a project already under way follows the
 * checklist inside its sheet's process without anyone re-tagging it.
 *
 * Pure: no Firestore, so the projection, the Client tab and the tests share it.
 */

/** The section and item fields this reads. SOP templates and live checklists both fit. */
type TaggedSection = Pick<ChecklistSection, 'title' | 'clientStep' | 'clientWho' | 'clientStage'> & {
  order?: number;
  items?: (Pick<ChecklistItem, 'title' | 'clientStep' | 'clientWho' | 'clientHidden'> &
    Partial<Pick<ChecklistItem, 'status' | 'completedAt' | 'dueDate' | 'order' | 'fields' | 'values'>>)[];
};

export interface ChecklistProcessOptions {
  /**
   * The SOPs the checklists were made from, for labels a checklist does not
   * carry itself. Leave out to read only the checklist's own labels.
   */
  templates?: readonly Pick<SOPTemplate, 'id' | 'service' | 'sections'>[];
  /** The agency's own start and close sections, which wrap every checklist. */
  agency?: readonly Omit<SOPTemplateSection, 'order'>[];
}

/** "Feedback on the Moodboard!" and "feedback on moodboard" are the same step. */
export function stepKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/colour/g, 'color')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/\b(the|a|an|your|our)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slug(text: string): string {
  return stepKey(text).replace(/\s+/g, '-').slice(0, 60) || 'step';
}

function titleKey(title: string | undefined): string {
  return (title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clean(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function ownerOf(who: ClientStepWho | undefined): TimelineStep['owner'] {
  if (who === 'client') return 'client';
  if (who === 'together') return 'both';
  return undefined;
}

function dayOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const day = value.slice(0, 10);
  return isIsoDay(day) ? day : undefined;
}

interface Fallback {
  section: Omit<SOPTemplateSection, 'order'>;
  stage?: string;
  items: Map<string, SOPTemplateItem>;
}

/** The SOP sections a checklist came from, by title, with the stage each falls under. */
function fallbacksFor(checklist: Pick<ProjectChecklist, 'templateId' | 'templateIds'>, options: ChecklistProcessOptions) {
  const byTitle = new Map<string, Fallback>();
  const add = (section: Omit<SOPTemplateSection, 'order'>, stage: string | undefined) => {
    const key = titleKey(section.title);
    if (!key || byTitle.has(key)) return;
    const items = new Map<string, SOPTemplateItem>();
    for (const item of section.items ?? []) {
      const itemKey = titleKey(item.title);
      if (itemKey && !items.has(itemKey)) items.set(itemKey, item);
    }
    byTitle.set(key, { section, stage: clean(section.clientStage) || stage, items });
  };

  const ids = checklist.templateIds?.length ? checklist.templateIds : checklist.templateId ? [checklist.templateId] : [];
  for (const id of ids) {
    const template = options.templates?.find((t) => t.id === id);
    if (!template) continue;
    const stage = isServiceId(template.service) ? SERVICE_LABELS[template.service] : undefined;
    for (const section of template.sections ?? []) add(section, stage);
  }
  for (const section of options.agency ?? []) add(section, undefined);
  return byTitle;
}

interface Bucket {
  key: string;
  title: string;
  stage: string;
  who?: ClientStepWho;
  items: { status?: ChecklistItem['status']; doneOn?: string; dueDate?: string }[];
}

/**
 * The day an item was actually done: a date the team recorded on it ("Held
 * on", "Approved on") when there is one, else the day it was ticked. A kickoff
 * call ticked a fortnight late still happened on the day it happened. Only the
 * day leaves the item, never the value's label or anything else recorded.
 */
function doneOn(item: Partial<Pick<ChecklistItem, 'completedAt' | 'fields' | 'values'>>): string | undefined {
  const recorded = (item.fields ?? [])
    .filter((f) => f.type === 'date')
    .map((f) => dayOf(item.values?.[f.id]))
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  return recorded ?? dayOf(item.completedAt);
}

const DONE = new Set(['completed', 'skipped']);

/** Where a step stands, from its items. All skipped means the step is not happening. */
function stepFrom(bucket: Bucket): TimelineStep | null {
  const items = bucket.items;
  if (items.length > 0 && items.every((i) => i.status === 'skipped')) return null;
  const finished = items.every((i) => DONE.has(i.status ?? ''));
  const started = items.some((i) => i.status === 'completed' || i.status === 'in_progress');
  const state: PlanStageState = finished ? 'done' : started ? 'current' : 'upcoming';

  const step: TimelineStep = { id: `ck-${slug(bucket.key)}`, title: bucket.title, state };
  if (state === 'done') {
    const day = items.map((i) => i.doneOn).filter((d): d is string => !!d).sort().pop();
    if (day) step.endDate = day;
  } else {
    const due = items
      .filter((i) => !DONE.has(i.status ?? ''))
      .map((i) => dayOf(i.dueDate))
      .filter((d): d is string => !!d)
      .sort()
      .pop();
    if (due) step.endDate = due;
  }
  const owner = ownerOf(bucket.who);
  if (owner) step.owner = owner;
  if (owner === 'client' && state === 'current') step.waiting = true;
  return step;
}

/**
 * The process the client sees, stage by stage, from the project's checklists.
 *
 * Steps run in the order their first item appears on the checklist, under the
 * stage of the section that item is in. Two sections with the same label are
 * one step ("CMS, forms & integrations" from both the CMS and the integrations
 * sections). Empty when nothing on the checklists is labelled for the client.
 */
export function checklistProcess(
  checklists: readonly Pick<ProjectChecklist, 'sections' | 'templateId' | 'templateIds' | 'createdAt'>[],
  options: ChecklistProcessOptions = {},
): TimelineStageSource[] {
  const buckets = new Map<string, Bucket>();
  const stageOrder: string[] = [];

  const ordered = [...checklists].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  for (const checklist of ordered) {
    const fallbacks = options.templates || options.agency ? fallbacksFor(checklist, options) : null;
    let previousStage: string | undefined;
    const sections = [...((checklist.sections ?? []) as TaggedSection[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const section of sections) {
      const fallback = fallbacks?.get(titleKey(section.title));
      const stage = clean(section.clientStage) || fallback?.stage || previousStage || 'Project';
      previousStage = stage;
      const sectionStep = clean(section.clientStep) || clean(fallback?.section.clientStep);
      const sectionWho = section.clientStep ? section.clientWho : fallback?.section.clientWho ?? section.clientWho;

      const items = [...(section.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const item of items) {
        const source = fallback?.items.get(titleKey(item.title));
        if (item.clientHidden || (!item.clientStep && source?.clientHidden)) continue;
        const own = clean(item.clientStep) || clean(source?.clientStep);
        const title = own || sectionStep;
        if (!title) continue;
        const who = own ? (item.clientStep ? item.clientWho : source?.clientWho ?? item.clientWho) : sectionWho;

        const key = stepKey(title);
        if (!key) continue;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { key, title, stage, who, items: [] };
          buckets.set(key, bucket);
          if (!stageOrder.includes(stage)) stageOrder.push(stage);
        }
        bucket.items.push({
          status: item.status,
          doneOn: item.status === 'completed' ? doneOn(item) : undefined,
          dueDate: item.dueDate,
        });
      }
    }
  }

  return stageOrder
    .map((stage) => {
      const steps = [...buckets.values()]
        .filter((b) => b.stage === stage)
        .map(stepFrom)
        .filter((s): s is TimelineStep => s !== null);
      const days = steps.map((s) => s.endDate).filter((d): d is string => !!d).sort();
      const source: TimelineStageSource = {
        stage: { id: `ck-stage-${slug(stage)}`, title: stage, deliverables: [], files: [] },
        steps,
      };
      if (days.length) {
        source.stage.startDate = days[0];
        source.stage.dueDate = days[days.length - 1];
      }
      return source;
    })
    .filter((source) => source.steps.length > 0);
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

const RANK: Record<PlanStageState, number> = { upcoming: 0, current: 1, done: 2 };

export interface FollowedSheet {
  sources: TimelineStageSource[];
  /** Sheet steps whose progress the checklist moves. */
  followed: number;
  /** Sheet steps the checklist has no step for, by title: these move only in the sheet. */
  unmatched: string[];
}

/**
 * The sheet's Process, moved along by the checklist.
 *
 * The sheet still says what the client sees and in what order, with the notes
 * and links only it has. Where a sheet step has the same name as a checklist
 * step, whichever of the two is further along wins, so ticking the checklist
 * moves the client's page without anyone touching the sheet, and a sheet
 * updated by hand is never pulled backwards by a checklist nobody ticked.
 */
export function followChecklist(sheet: readonly TimelineStageSource[], process: readonly TimelineStageSource[]): FollowedSheet {
  const byKey = new Map<string, TimelineStep>();
  for (const source of process) for (const step of source.steps) byKey.set(stepKey(step.title), step);

  let followed = 0;
  const unmatched: string[] = [];
  const sources = sheet.map((source) => ({
    stage: source.stage,
    steps: source.steps.map((step) => {
      const match = byKey.get(stepKey(step.title));
      if (!match) {
        unmatched.push(step.title);
        return step;
      }
      followed += 1;
      const state = RANK[match.state] > RANK[step.state] ? match.state : step.state;
      const next: TimelineStep = { ...step, state };
      if (state === 'done') {
        // The day it was ticked beats a planned date; a date typed beside "Done" stays.
        if (step.state !== 'done' && match.endDate) {
          next.endDate = match.endDate;
          delete next.startDate;
        }
      } else if (!next.endDate && !next.startDate && match.endDate) {
        next.endDate = match.endDate;
      }
      if (!next.owner && match.owner) next.owner = match.owner;
      const waiting = state !== 'done' && (step.waiting === true || (next.owner === 'client' && state === 'current'));
      if (waiting) next.waiting = true;
      else delete next.waiting;
      return next;
    }),
  }));

  return { sources, followed, unmatched };
}
