import type { ClientStepWho, Project, ProjectChecklist, ProjectTimeline, SOPTemplate, SOPTemplateSection, Task } from '@/types';
import { normalizeClientStatus } from '@/types';
import { servicesName, orderServices, isServiceId } from '@/lib/engagements';
import { resolveTimelinePlan } from './client-timeline';
import { portalStageSources } from './portal-sources';

/**
 * What the app writes into a project's sheet, from what the app knows.
 *
 * Rehan, 2026-10-01: the sheet should be created by the app and "in sync
 * continuously with any update in Checklist", one per project, shaped by what
 * it bought. So the sheet is a view, written one way: the Process tab is the
 * client's process exactly as their page shows it (the checklist's client
 * steps, only the stages this project has; a project run from its Timeline
 * whose checklist nobody ticked, like Privado, shows its Timeline), Pages is the
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
  checks: 'Checklist',
  seo: 'SEO',
} as const;

export const MANAGED_PROCESS_HEADER = ['#', 'Stage', 'Step', 'Who', 'Status', 'Date'] as const;
export const MANAGED_PAGES_HEADER = ['Page', 'Copy', 'Design', 'Development', 'Link'] as const;
export const MANAGED_INPUTS_HEADER = ['Item', 'Needed by', 'Status'] as const;
export const MANAGED_CHECKS_HEADER = ['Section', 'Check', 'Status', 'Date'] as const;
export const MANAGED_SEO_HEADER = [
  'Page',
  'SEO title',
  'Title length',
  'Meta description',
  'Description length',
  'OG image',
  'Canonical',
  'Schema',
  'Images without alt',
  'To fix',
  'Checked',
] as const;
export const MANAGED_OVERVIEW_FIELDS = ['Client', 'Project', 'Services', 'Kickoff', 'Target launch', 'Project lead'] as const;

/** How the sheet explains itself, beside the Overview. */
export const MANAGED_HELP = [
  'About this sheet',
  '1. ActiveSet keeps this sheet up to date from the project itself: every step, page and request, as it happens.',
  '2. Process is every step of the project, in order. Done shows the day it was done; otherwise the day it is planned for. Link opens what the step is about.',
  '3. Pages shows where each page is: copy, design and development.',
  '4. What we need is everything we are waiting on from you, and what has arrived.',
  '5. Checklist is our QA, SEO and launch checks; SEO is what each page tells search engines and AI answers, as of the date shown.',
  '6. Edits made here are replaced at the next update, so tell your ActiveSet lead instead.',
] as const;

/** At most this many key links: the Overview's look is laid out for them once. */
export const MAX_LINKS = 10;

export interface ManagedSheetContent {
  /** The sheet's file name and its Overview title. */
  title: string;
  overview: Record<(typeof MANAGED_OVERVIEW_FIELDS)[number], string>;
  links: { name: string; url: string }[];
  /** `now` marks the step the project is on, as the client's page decides it. */
  process: { stage: string; step: string; who: string; status: string; date: string; link: string; now?: boolean }[];
  pages: { page: string; copy: string; design: string; development: string; link: string }[];
  inputs: { item: string; neededBy: string; status: string }[];
  /** The steps of the checklist's sections marked for the sheet: QA, SEO, pre-launch. */
  checks: { section: string; check: string; status: string; date: string }[];
  /** Each scanned page, as search engines and AI answers read it. */
  seo: {
    page: string;
    title: string;
    titleLength: number | '';
    description: string;
    descriptionLength: number | '';
    ogImage: string;
    canonical: string;
    schema: string;
    imagesWithoutAlt: number | '';
    toFix: string;
    checked: string;
  }[];
}

/** One page's last scan, as much as the SEO tab reads of it. */
export interface SheetSeoInput {
  url: string;
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  schemaTypes?: string[];
  imagesWithoutAlt?: number;
  h1Count?: number;
  checkedAt?: string;
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
  project: Pick<Project, 'name' | 'client' | 'services' | 'reviewOwnerEmail' | 'links' | 'clientTimeline' | 'clientFacing'>;
  checklists: readonly Pick<ProjectChecklist, 'sections' | 'templateId' | 'templateIds' | 'createdAt'>[];
  templates?: readonly Pick<SOPTemplate, 'id' | 'service' | 'sections'>[];
  agency?: readonly Omit<SOPTemplateSection, 'order'>[];
  /** The Timeline tab, which the client's page follows when the checklist has not been started. */
  timeline?: Pick<ProjectTimeline, 'phases' | 'milestones'> | null;
  pages?: readonly SheetPageInput[];
  /** Tasks flagged for the client. Only `needsClientInput` ones are read. */
  asks?: readonly Pick<Task, 'title' | 'dueDate' | 'status' | 'needsClientInput' | 'order'>[];
  /** The last scan of each of the site's pages, in the order to list them. */
  seo?: readonly SheetSeoInput[];
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

/** The team's own tools: their links open nothing for a client, or open too much. */
const INTERNAL_LINK = /^https?:\/\/([a-z0-9-]+\.)*(clickup\.com|slack\.com)(\/|$)|^https?:\/\/(www\.)?fathom\.video\/calls\//i;

/**
 * Links worth showing the client, on the sheet and on their page: the ones the
 * team added, never the pages the app found on its own, nor the team's own
 * tools (ClickUp, Slack, Fathom's team links).
 */
export function clientKeyLinks(links: Project['links'] | undefined): { name: string; url: string }[] {
  return (links ?? [])
    .filter((l) => l && l.source !== 'auto' && typeof l.url === 'string' && /^https?:\/\//i.test(l.url.trim()))
    .filter((l) => !INTERNAL_LINK.test(l.url.trim()))
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

const CHECK_WORDS: Record<string, string> = { completed: 'Done', in_progress: 'In progress', skipped: 'Not needed' };
const dayOf = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '');
/** A step's title without the emoji a template starts it with. */
const plain = (title: string) => title.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();

/**
 * The steps of every section marked for the sheet. A checklist made before its
 * SOP marked the section borrows the mark by section title, as client labels are.
 */
export function sheetChecks(
  checklists: ManagedSheetInput['checklists'],
  templates: ManagedSheetInput['templates'] = [],
): ManagedSheetContent['checks'] {
  const marked = new Set(
    (templates ?? []).flatMap((t) => t.sections.filter((s) => s.onProjectSheet).map((s) => s.title.trim().toLowerCase())),
  );
  return checklists.flatMap((checklist) =>
    [...(checklist.sections ?? [])]
      .filter((section) => section.onProjectSheet || marked.has(section.title.trim().toLowerCase()))
      .flatMap((section) =>
        [...(section.items ?? [])]
          .filter((item) => !item.clientHidden)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((item) => ({
            section: plain(section.title).replace(/^step \d+:\s*/i, ''),
            check: plain(item.title),
            status: CHECK_WORDS[item.status ?? ''] ?? 'Not started',
            date: item.status === 'completed' ? dayOf(item.completedAt) : dayOf(item.dueDate),
          })),
      ),
  );
}

/** What a page's tags need, in plain words; empty when nothing does. */
export function seoToFix(page: SheetSeoInput): string {
  const fixes: string[] = [];
  const title = page.title?.trim() ?? '';
  const description = page.description?.trim() ?? '';
  if (!title) fixes.push('add an SEO title');
  else if (title.length > 60) fixes.push('shorten the title (60 max)');
  if (!description) fixes.push('add a meta description');
  else if (description.length > 160) fixes.push('shorten the description (160 max)');
  else if (description.length < 70) fixes.push('lengthen the description (70+)');
  if (!page.ogImage) fixes.push('add an OG image');
  if (!page.canonical) fixes.push('set a canonical');
  if (!page.schemaTypes?.length) fixes.push('add schema');
  if (page.h1Count !== undefined && page.h1Count !== 1) fixes.push(page.h1Count === 0 ? 'add an H1' : 'keep one H1');
  if ((page.imagesWithoutAlt ?? 0) > 0) fixes.push(`alt text on ${page.imagesWithoutAlt} image${page.imagesWithoutAlt === 1 ? '' : 's'}`);
  return fixes.join('; ');
}

function seoRows(pages: readonly SheetSeoInput[] = []): ManagedSheetContent['seo'] {
  return pages.map((page) => {
    const title = page.title?.trim() ?? '';
    const description = page.description?.trim() ?? '';
    return {
      page: page.url,
      title,
      titleLength: title ? title.length : '',
      description,
      descriptionLength: description ? description.length : '',
      ogImage: page.ogImage ?? '',
      canonical: page.canonical ?? '',
      schema: (page.schemaTypes ?? []).join(', '),
      imagesWithoutAlt: page.imagesWithoutAlt ?? '',
      toFix: seoToFix(page) || 'Nothing',
      checked: dayOf(page.checkedAt),
    };
  });
}

export function managedSheetContent(input: ManagedSheetInput): ManagedSheetContent {
  const { project } = input;
  // The same stages the client's page shows, from the same place. (A sheet the
  // app keeps is never read back, so no sheet goes in here.)
  const process = portalStageSources({
    checklists: input.checklists,
    templates: input.templates,
    agency: input.agency,
    timeline: input.timeline,
    timelineSettings: project.clientTimeline,
  }).sources;

  // The step we are on: the first unfinished one in the stage the client's
  // page puts the project in, not merely the first unfinished row, so the
  // sheet and the portal never disagree about where the project is. A
  // delivered project is on none.
  const resolved = resolveTimelinePlan(process, { status: normalizeClientStatus(project.clientFacing?.status) });
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
        link: step.url ?? '',
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
    links: clientKeyLinks(project.links),
    process: rows,
    pages,
    inputs,
    checks: sheetChecks(input.checklists, input.templates),
    seo: seoRows(input.seo),
  };
}
