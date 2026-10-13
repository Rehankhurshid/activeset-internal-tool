import type { PageWorkOwner } from '@/types';
import type { PageWorkStatus, ProjectPage, StackDiscipline } from '@/modules/delivery';

const STATUSES: readonly PageWorkStatus[] = ['not_started', 'in_progress', 'blocked', 'in_review', 'completed', 'not_required'];
/** As the delivery module's `normalizePageWorkStatus`: anything unknown has not started. */
const normalizePageWorkStatus = (raw: unknown): PageWorkStatus =>
  STATUSES.includes(raw as PageWorkStatus) ? (raw as PageWorkStatus) : 'not_started';

/**
 * Where one page stands for the client, page by page (Rehan, 2026-10-13: on
 * Different AI the client keeps designing while we build, and the pages we
 * have built are ready to review long before the process reaches "Review on
 * staging").
 *
 * - `ready`: our own columns are done, so they can open it on staging and
 *   comment in MarkUp. Their design still changing does not hold it back; it
 *   is built to the design we have, and a new revision gets built when it
 *   arrives. There is no per-page sign-off (Rehan: "Looks good is not
 *   required"); their comments are the review.
 * - `building`: we have started our part.
 * - `waiting`: nothing of ours has started and their part (copy, design) has
 *   not arrived.
 * - `planned`: nothing has started on either side.
 */
/** Where to leave comments on the pages (the MarkUp board), with its how-to. */
export interface PortalPageFeedbackLink {
  label: string;
  url: string;
  help?: { label: string; url: string };
}

/** The page tracker as the projection takes it: its rows, the stack's columns and whose each column is. */
export interface PageTrackerInput {
  rows: ProjectPage[];
  disciplines: Pick<StackDiscipline, 'id' | 'label' | 'order'>[];
  owners: Record<string, PageWorkOwner>;
}

export type PortalPageState = 'ready' | 'building' | 'waiting' | 'planned';

export interface PortalPageView {
  id: string;
  title: string;
  /** Where the page is on staging, when the team recorded it. Always http(s). */
  stagingUrl?: string;
  state: PortalPageState;
  /** Their own parts that are not final yet, in their words: "Your design: in revision". */
  theirs?: string[];
}

const SETTLED = new Set<PageWorkStatus>(['completed', 'not_required']);
const BUILT = new Set<PageWorkStatus>(['completed', 'not_required', 'in_review']);
const STARTED = new Set<PageWorkStatus>(['in_progress', 'blocked', 'in_review', 'completed']);

/** Their column's status, said to them. */
const THEIR_WORD: Record<PageWorkStatus, string> = {
  not_started: 'not in yet',
  in_progress: 'in revision',
  blocked: 'on hold',
  in_review: 'received, we are checking it',
  completed: 'final',
  not_required: 'not needed',
};

const isHttp = (url: string | undefined): url is string => typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim());

/** One page's state from its columns: ours decide whether it is built, theirs only add a note. */
export function portalPageState(
  page: Pick<ProjectPage, 'work'>,
  disciplines: readonly Pick<StackDiscipline, 'id'>[],
  owners: Readonly<Record<string, PageWorkOwner>>,
): PortalPageState {
  const statusOf = (id: string) => normalizePageWorkStatus(page.work?.[id]);
  const ours = disciplines.filter((d) => (owners[d.id] ?? 'activeset') !== 'client').map((d) => statusOf(d.id));
  const theirs = disciplines.filter((d) => owners[d.id] === 'client').map((d) => statusOf(d.id));
  const relevant = ours.filter((s) => s !== 'not_required');
  if (relevant.length > 0 && ours.every((s) => BUILT.has(s))) return 'ready';
  if (ours.some((s) => STARTED.has(s))) return 'building';
  if (theirs.some((s) => !SETTLED.has(s))) return 'waiting';
  return 'planned';
}

/**
 * The client's view of the pages being built, in the grid's order. Only the
 * page's name, its staging link, its state and their own parts leave: never
 * assignees, dates, review comments, design links or QC answers.
 */
export function portalPages(
  pages: readonly ProjectPage[],
  disciplines: readonly Pick<StackDiscipline, 'id' | 'label' | 'order'>[],
  owners: Readonly<Record<string, PageWorkOwner>>,
): PortalPageView[] {
  const columns = [...disciplines].sort((a, b) => a.order - b.order);
  return [...pages]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((page) => {
      const state = portalPageState(page, columns, owners);
      const view: PortalPageView = { id: page.id, title: page.title?.trim() || page.path, state };
      if (isHttp(page.stagingLink)) view.stagingUrl = page.stagingLink.trim();
      const theirs = columns
        .filter((d) => owners[d.id] === 'client')
        .map((d) => ({ d, status: normalizePageWorkStatus(page.work?.[d.id]) }))
        .filter(({ status }) => !SETTLED.has(status))
        .map(({ d, status }) => `Your ${d.label.toLowerCase()}: ${THEIR_WORD[status]}`);
      if (theirs.length) view.theirs = theirs;
      return view;
    });
}
