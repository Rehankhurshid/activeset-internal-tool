import type { ClientStepWho, Project, ProjectChecklist, SOPTemplate, SOPTemplateSection, Task } from '@/types';
import { servicesName, orderServices, isServiceId } from '@/lib/engagements';
import { checklistProcess } from './checklist-process';
import { resolveTimelinePlan } from './client-timeline';

/**
 * What the app writes into a project's sheet, from what the app knows.
 *
 * Rehan, 2026-10-01: the sheet should be created by the app and "in sync
 * continuously with any update in Checklist", one per project, shaped by what
 * it bought. So the sheet is a view, written one way: the Process tab is the
 * checklist's client steps (only the stages this project has), Pages is the
 * page tracker, What we need is every request flagged for the client. Nothing
 * here is typed by hand, which is why it has no Link, Note or Why columns: the
 * app would have nothing to put in them.
 *
 * Pure: the server writer, the tests and anything that previews a sheet share it.
 */

export const MANAGED_TABS = {
  overview: 'Overview',
  process: 'Process',
  pages: 'Pages',
  inputs: 'What we need',
} as const;

export const MANAGED_PROCESS_HEADER = ['#', 'Stage', 'Step', 'Who', 'Status', 'Date'] as const;
export const MANAGED_PAGES_HEADER = ['Page', 'Copy', 'Design', 'Development', 'Link'] as const;
export const MANAGED_INPUTS_HEADER = ['Item', 'Needed by', 'Status'] as const;
export const MANAGED_OVERVIEW_FIELDS = ['Client', 'Project', 'Services', 'Kickoff', 'Target launch', 'Project lead'] as const;

/** How the sheet explains itself, beside the Overview. */
export const MANAGED_HELP = [
  'About this sheet',
  '1. ActiveSet keeps this sheet up to date from the project itself: every step, page and request, as it happens.',
  '2. Process is every step of the project, in order. Done shows the day it was done; otherwise the day it is planned for.',
  '3. Pages shows where each page is: copy, design and development.',
  '4. What we need is everything we are waiting on from you, and what has arrived.',
  '5. Edits made here are replaced at the next update, so tell your ActiveSet lead instead.',
] as const;

/** At most this many key links: the Overview's look is laid out for them once. */
export const MAX_LINKS = 10;

export interface ManagedSheetContent {
  /** The sheet's file name and its Overview title. */
  title: string;
  overview: Record<(typeof MANAGED_OVERVIEW_FIELDS)[number], string>;
  links: { name: string; url: string }[];
  /** `now` marks the step the project is on, as the client's page decides it. */
  process: { stage: string; step: string; who: string; status: string; date: string; now?: boolean }[];
  pages: { page: string; copy: string; design: string; development: string; link: string }[];
  inputs: { item: string; neededBy: string; status: string }[];
}

/** The page tracker's rows, as much as the sheet reads of them. */
export interface SheetPageInput {
  title: string;
  path: string;
  order: number;
  work: Record<string, string>;
  stagingLink?: string;
}

export interface ManagedSheetInput {
  project: Pick<Project, 'name' | 'client' | 'services' | 'reviewOwnerEmail' | 'links'>;
  checklists: readonly Pick<ProjectChecklist, 'sections' | 'templateId' | 'templateIds' | 'createdAt'>[];
  templates?: readonly Pick<SOPTemplate, 'id' | 'service' | 'sections'>[];
  agency?: readonly Omit<SOPTemplateSection, 'order'>[];
  pages?: readonly SheetPageInput[];
  /** Tasks flagged for the client. Only `needsClientInput` ones are read. */
  asks?: readonly Pick<Task, 'title' | 'dueDate' | 'status' | 'needsClientInput' | 'order'>[];
}

const WHO: Record<ClientStepWho | 'none', string> = { activeset: 'ActiveSet', client: 'Client', together: 'Together', none: 'ActiveSet' };

/** A page discipline's status in the sheet's words, the same words as the Process tab. */
export function pageWord(status: string | undefined): string {
  switch (status) {
    case 'completed':
      return 'Done';
    case 'not_required':
      return 'Not needed';
    case 'in_review':
      return 'Waiting on client';
    case 'in_progress':
    case 'blocked':
      return 'In progress';
    default:
      return 'Not started';
  }
}

/** Desktop and mobile as one Development column: done when both are, waiting when either waits on the client. */
export function developmentWord(desktop: string | undefined, mobile: string | undefined): string {
  const words = [pageWord(desktop), pageWord(mobile)];
  if (words.every((w) => w === 'Done' || w === 'Not needed')) return words.includes('Done') ? 'Done' : 'Not needed';
  if (words.includes('Waiting on client')) return 'Waiting on client';
  if (words.some((w) => w !== 'Not started')) return 'In progress';
  return 'Not started';
}

/** Links worth showing the client: the ones the team added, never the pages the app found on its own. */
function keyLinks(project: ManagedSheetInput['project']): { name: string; url: string }[] {
  return (project.links ?? [])
    .filter((l) => l && l.source !== 'auto' && typeof l.url === 'string' && /^https?:\/\//i.test(l.url.trim()))
    // The old tracker link is what this sheet replaces.
    .filter((l) => !/^project tracker$/i.test(l.title.trim()))
    .slice(0, MAX_LINKS)
    .map((l) => ({ name: l.title.trim(), url: l.url.trim() }));
}

/** Our lead as the checklist records it ("Name the leads on both sides"), when the project names none. */
function ourLead(checklists: ManagedSheetInput['checklists']): string {
  for (const checklist of checklists) {
    for (const section of checklist.sections ?? []) {
      for (const item of section.items ?? []) {
        const value = item.values?.our_lead?.trim();
        if (value) return value;
      }
    }
  }
  return '';
}

export function managedSheetContent(input: ManagedSheetInput): ManagedSheetContent {
  const { project } = input;
  const process = checklistProcess(input.checklists, { templates: input.templates, agency: input.agency });

  // The step we are on: the first unfinished one in the stage the client's
  // page puts the project in, not merely the first unfinished row, so the
  // sheet and the portal never disagree about where the project is.
  const resolved = resolveTimelinePlan(process);
  const nowStage = resolved.currentIndex >= 0 ? process[resolved.currentIndex] : undefined;
  const nowStep = nowStage?.steps.find((s) => s.state !== 'done');

  const rows = process.flatMap((source) =>
    source.steps.map((step) => {
      const row: ManagedSheetContent['process'][number] = {
        stage: source.stage.title,
        step: step.title,
        who: WHO[step.owner === 'client' ? 'client' : step.owner === 'both' ? 'together' : 'none'],
        status: step.state === 'done' ? 'Done' : step.waiting ? 'Waiting on client' : step.state === 'current' ? 'In progress' : 'Not started',
        date: step.endDate ?? step.startDate ?? '',
      };
      if (step === nowStep) row.now = true;
      return row;
    }),
  );

  // The services it bought, else what its checklist's SOPs deliver.
  const fromTemplates = (input.templates ?? []).map((t) => t.service).filter(isServiceId);
  const services = servicesName(orderServices(project.services?.length ? project.services : fromTemplates));
  const kickoff = rows.find((r) => /kickoff call/i.test(r.step));
  const launch = rows.find((r) => r.stage === 'Launch') ?? rows.find((r) => /go live|launch/i.test(r.step));
  const client = project.client?.trim() || project.name;

  const pages = [...(input.pages ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((page) => ({
      page: page.title?.trim() || page.path,
      copy: pageWord(page.work?.copy),
      design: pageWord(page.work?.design),
      development: developmentWord(page.work?.dev_desktop, page.work?.dev_mobile),
      link: page.stagingLink && /^https?:\/\//i.test(page.stagingLink) ? page.stagingLink : '',
    }));

  const inputs = (input.asks ?? [])
    .filter((t) => t.needsClientInput === true)
    .map((t) => ({ item: t.title.trim(), neededBy: t.dueDate ?? '', status: t.status === 'done' ? 'Received' : 'Waiting', order: t.order ?? 0 }))
    // What we are still waiting on first, soonest first; then what has arrived.
    .sort(
      (a, b) =>
        Number(a.status === 'Received') - Number(b.status === 'Received') ||
        (a.neededBy || '9999').localeCompare(b.neededBy || '9999') ||
        a.order - b.order,
    )
    .map(({ item, neededBy, status }) => ({ item, neededBy, status }));

  return {
    title: `${client} · Project Sheet`,
    overview: {
      Client: client,
      Project: project.name,
      Services: services,
      Kickoff: kickoff?.date ?? '',
      'Target launch': launch?.date ?? '',
      'Project lead': project.reviewOwnerEmail || ourLead(input.checklists),
    },
    links: keyLinks(project),
    process: rows,
    pages,
    inputs,
  };
}
