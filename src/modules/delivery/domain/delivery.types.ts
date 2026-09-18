/**
 * Website delivery: the page is the unit of work.
 *
 * Every website project this agency runs is tracked, in a spreadsheet, as a row
 * per page with a status per discipline. This module makes that the model, and
 * anything specific to a technology lives in a {@link StackDefinition} rather
 * than in the code that renders or reports on it.
 */

/**
 * `StackId`, `CheckStatus` and `ProjectDeliveryState` sit on the project
 * document, so they are declared in @/types with the rest of `Project` and
 * re-exported here — the same arrangement the client-portal module uses.
 */
export type { CheckStatus, ProjectDeliveryState, StackId } from '@/types';
import type { CheckStatus, StackId } from '@/types';

/**
 * How far a single discipline has got on a single page.
 *
 * The values come from what the team already writes in the trackers:
 * "Completed", "WIP", "N/R", "Wireframe Ready". `not_required` matters — plenty
 * of pages legitimately need no copy work, and counting them as outstanding
 * makes every project look permanently unfinished.
 */
export type PageWorkStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'completed'
  | 'not_required';

export const PAGE_WORK_STATUSES: PageWorkStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'in_review',
  'completed',
  'not_required',
];

export const PAGE_WORK_STATUS_LABELS: Record<PageWorkStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  completed: 'Completed',
  not_required: 'Not required',
};

/** Statuses that need no further work. */
export const SETTLED_PAGE_STATUSES: ReadonlySet<PageWorkStatus> = new Set<PageWorkStatus>([
  'completed',
  'not_required',
]);

export function normalizePageWorkStatus(raw: unknown): PageWorkStatus {
  return PAGE_WORK_STATUSES.includes(raw as PageWorkStatus) ? (raw as PageWorkStatus) : 'not_started';
}

/**
 * A column in the page grid: one strand of work that runs across every page.
 * Webflow uses copy / design / dev desktop / dev mobile; other stacks and other
 * clients differ, which is why this is data.
 */
export interface StackDiscipline {
  id: string;
  label: string;
  /** Used for grid headers, where horizontal space is scarce. */
  shortLabel: string;
  order: number;
}

/**
 * Checks the existing page audit can answer on its own, so the team ticks
 * judgement calls rather than things a crawler already knows.
 */
export type AutoCheckId =
  | 'page_title'
  | 'meta_description'
  | 'single_h1'
  | 'image_alt'
  | 'open_graph'
  | 'links_resolve'
  | 'schema'
  | 'spelling';

/** `unknown` means the page has not been scanned, which is not the same as failing. */
export type AutoCheckVerdict = 'pass' | 'fail' | 'unknown';

/**
 * One item on a launch checklist. `site` items are asked once for the whole
 * project; `page` items are asked of every page.
 */
export interface StackCheck {
  id: string;
  title: string;
  /** Heading it sits under, e.g. 'SEO & analytics'. */
  group: string;
  scope: 'site' | 'page';
  order: number;
  /** Answered from scan data when present; still overridable by a person. */
  auto?: AutoCheckId;
  /** Shown beside the item when it needs explaining. */
  note?: string;
  /** Checked after the site is live rather than before. */
  postLaunch?: boolean;
}

/** Something needed from the client before the build can start. */
export interface StackKickoffInput {
  id: string;
  title: string;
  order: number;
  optional?: boolean;
  note?: string;
}

export interface StackDefinition {
  id: StackId;
  name: string;
  description: string;
  disciplines: StackDiscipline[];
  checks: StackCheck[];
  kickoffInputs: StackKickoffInput[];
}

/**
 * A page being built, stored at `projects/{projectId}/pages/{pageId}`.
 *
 * Seeded from the pages the app already discovers (sitemap scan, Webflow sync)
 * rather than typed again, which is the duplication this replaces. It is a
 * curated subset: discovering a URL does not mean it is being built.
 */
export interface ProjectPage {
  id: string;
  /** Site-relative path, e.g. `/pricing`. The stable identity of the page. */
  path: string;
  /** What the team calls it, e.g. "Pricing". */
  title: string;
  /** Optional grouping, mirroring the header rows in the trackers ("Features [P1]"). */
  group?: string;
  order: number;
  /** Discipline id → status. Absent means not started. */
  work: Record<string, PageWorkStatus>;
  /** Check id → a person's answer. Only for `page`-scoped checks. */
  qc?: Record<string, CheckStatus>;
  assignee?: string;
  /** ISO YYYY-MM-DD, matching the DatePicker convention used elsewhere. */
  expectedDate?: string;
  designLink?: string;
  stagingLink?: string;
  docsLink?: string;
  reviewComment?: string;
  /** The discovered link this page was seeded from, when it was. */
  sourceLinkId?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateProjectPageInput = Pick<ProjectPage, 'path' | 'title'> &
  Partial<Omit<ProjectPage, 'id' | 'path' | 'title' | 'createdAt' | 'updatedAt'>>;
