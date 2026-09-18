import type { AuditResult, ChecklistItem } from '@/types';
import {
  SETTLED_PAGE_STATUSES,
  isAutoCheckId,
  normalizePageWorkStatus,
  type AutoCheckId,
  type AutoCheckVerdict,
  type CheckStatus,
  type ProjectDeliveryState,
  type ProjectPage,
  type StackCheck,
  type StackDefinition,
  type StackDiscipline,
} from './delivery.types';

/**
 * Everything derived from pages and checklists: how far along a project is, and
 * whether it is actually ready to launch.
 *
 * Pure functions over plain data, so the same numbers back the page grid, the
 * project list, the generated Sheet and the client's status line. "Ready to
 * launch" is computed from the work, never asserted by a person.
 */

export interface DisciplineProgress {
  disciplineId: string;
  label: string;
  done: number;
  /** Pages where this discipline applies, i.e. excluding `not_required`. */
  applicable: number;
  blocked: number;
}

export interface PageProgress {
  /** Pages where every applicable discipline is settled. */
  done: number;
  total: number;
  blocked: number;
  /** Per-discipline breakdown, in the stack's own order. */
  disciplines: DisciplineProgress[];
}

export function buildPageProgress(stack: StackDefinition, pages: ProjectPage[]): PageProgress {
  const disciplines = [...stack.disciplines].sort((a, b) => a.order - b.order);

  const perDiscipline: DisciplineProgress[] = disciplines.map((d) => {
    let done = 0;
    let applicable = 0;
    let blocked = 0;
    for (const page of pages) {
      const status = normalizePageWorkStatus(page.work?.[d.id]);
      if (status === 'not_required') continue;
      applicable += 1;
      if (status === 'completed') done += 1;
      if (status === 'blocked') blocked += 1;
    }
    return { disciplineId: d.id, label: d.label, done, applicable, blocked };
  });

  let donePages = 0;
  let blockedPages = 0;
  for (const page of pages) {
    let anyApplicable = false;
    let allSettled = true;
    let isBlocked = false;
    for (const d of disciplines) {
      const status = normalizePageWorkStatus(page.work?.[d.id]);
      if (status === 'blocked') isBlocked = true;
      if (status === 'not_required') continue;
      anyApplicable = true;
      if (!SETTLED_PAGE_STATUSES.has(status)) allSettled = false;
    }
    // A page where every discipline is "not required" is not an achievement.
    if (anyApplicable && allSettled) donePages += 1;
    if (isBlocked) blockedPages += 1;
  }

  return { done: donePages, total: pages.length, blocked: blockedPages, disciplines: perDiscipline };
}

/**
 * Answers a check from the page's own scan, where the scan can answer it.
 *
 * `unknown` is deliberate and distinct from `fail`: a page nobody has scanned
 * has not failed anything, and showing it as a failure would train the team to
 * ignore the column.
 */
export function resolveAutoCheck(id: AutoCheckId, audit: AuditResult | undefined): AutoCheckVerdict {
  if (!audit) return 'unknown';
  const seo = audit.categories?.seo;
  const snapshot = audit.contentSnapshot;

  switch (id) {
    case 'page_title': {
      const title = seo?.title ?? snapshot?.title;
      if (title === undefined) return 'unknown';
      return title.trim().length > 0 ? 'pass' : 'fail';
    }
    case 'meta_description': {
      const description = seo?.metaDescription ?? snapshot?.metaDescription;
      if (description === undefined) return 'unknown';
      return description.trim().length > 0 ? 'pass' : 'fail';
    }
    case 'single_h1': {
      if (!snapshot) return 'unknown';
      return snapshot.h1?.trim() ? 'pass' : 'fail';
    }
    case 'image_alt': {
      if (seo?.imagesWithoutAlt === undefined) return 'unknown';
      return seo.imagesWithoutAlt === 0 ? 'pass' : 'fail';
    }
    case 'open_graph': {
      const og = audit.categories?.openGraph;
      if (!og) return 'unknown';
      return og.hasOpenGraph ? 'pass' : 'fail';
    }
    case 'links_resolve': {
      const links = audit.categories?.links;
      if (!links || links.checkedAt === undefined) return 'unknown';
      return links.brokenLinks.length === 0 ? 'pass' : 'fail';
    }
    case 'schema': {
      const schema = audit.categories?.schema;
      if (!schema) return 'unknown';
      return schema.hasSchema ? 'pass' : 'fail';
    }
    case 'spelling': {
      const spelling = audit.categories?.spelling;
      if (!spelling) return 'unknown';
      return spelling.issues.length === 0 ? 'pass' : 'fail';
    }
    default:
      return 'unknown';
  }
}

/**
 * The answer shown for one check on one page: what a person said, or failing
 * that what the scan found. A person's answer always wins — they can see things
 * a crawler cannot, and they are the ones signing off.
 */
export function resolveCheck(
  check: StackCheck,
  manual: CheckStatus | undefined,
  audit: AuditResult | undefined,
): { status: CheckStatus; source: 'person' | 'scan' | 'none' } {
  if (manual && manual !== 'pending') return { status: manual, source: 'person' };
  if (!check.auto) return { status: 'pending', source: 'none' };
  const verdict = resolveAutoCheck(check.auto, audit);
  if (verdict === 'pass') return { status: 'passed', source: 'scan' };
  if (verdict === 'fail') return { status: 'failed', source: 'scan' };
  return { status: 'pending', source: 'none' };
}

export interface CheckProgress {
  passed: number;
  failed: number;
  pending: number;
  /** Excludes anything marked not required. */
  applicable: number;
}

function tally(results: { status: CheckStatus }[]): CheckProgress {
  const progress: CheckProgress = { passed: 0, failed: 0, pending: 0, applicable: 0 };
  for (const { status } of results) {
    if (status === 'not_required') continue;
    progress.applicable += 1;
    if (status === 'passed') progress.passed += 1;
    else if (status === 'failed') progress.failed += 1;
    else progress.pending += 1;
  }
  return progress;
}

export interface LaunchReadiness {
  pages: PageProgress;
  /** Site-wide checks, excluding post-launch ones. */
  siteChecks: CheckProgress;
  /** Per-page checks across every page. */
  pageChecks: CheckProgress;
  /** Post-launch checks, reported separately — they cannot pass before launch. */
  postLaunchChecks: CheckProgress;
  ready: boolean;
  /** Plain-language reasons it is not ready, in the order worth fixing. */
  blockers: string[];
}

export interface BuildLaunchReadinessInput {
  pages: ProjectPage[];
  /** The per-page QC questions for THIS project, already resolved. */
  pageChecks: StackCheck[];
  /**
   * Items from the project's own checklist sections tagged `launch`, already
   * flattened. The site-wide launch list is a checklist, so it differs per
   * project and is edited in one place.
   */
  launchChecklistItems?: ChecklistItem[];
  /** Page id → the latest audit for that page, when one exists. */
  auditsByPageId?: Record<string, AuditResult | undefined>;
}

/**
 * Whether the site can launch, and if not, why.
 *
 * Readiness is every applicable page built, every pre-launch site check answered
 * and passing, and every per-page check answered and passing. Post-launch checks
 * are tracked but never gate the launch, because most of them cannot be true
 * until the site is live.
 */
export function buildLaunchReadiness(
  input: BuildLaunchReadinessInput,
  disciplines: StackDiscipline[],
): LaunchReadiness {
  const { pages, pageChecks: pageCheckDefs, launchChecklistItems = [], auditsByPageId = {} } = input;

  const pageProgress = buildPageProgress({ disciplines } as StackDefinition, pages);

  // A checklist item is done when someone ticked it, or skipped it on purpose.
  // "skipped" is the checklist's way of saying not applicable, so it drops out
  // of the denominator the same way `not_required` does elsewhere.
  const siteResults: { status: CheckStatus }[] = launchChecklistItems.map((item) => {
    if (item.status === 'completed') return { status: 'passed' as CheckStatus };
    if (item.status === 'skipped') return { status: 'not_required' as CheckStatus };
    return { status: 'pending' as CheckStatus };
  });
  const siteChecks = tally(siteResults);
  // Post-launch is a checklist concern now; the section is simply not tagged
  // `launch` if the team does not want it gating anything.
  const postLaunchChecks: CheckProgress = { passed: 0, failed: 0, pending: 0, applicable: 0 };

  const pageCheckResults: { status: CheckStatus }[] = [];
  for (const page of pages) {
    const audit = auditsByPageId[page.id];
    for (const check of pageCheckDefs) {
      pageCheckResults.push(resolveCheck(check, page.qc?.[check.id], audit));
    }
  }
  const pageChecks = tally(pageCheckResults);

  const blockers: string[] = [];
  if (pages.length === 0) {
    blockers.push('No pages added yet');
  } else if (pageProgress.done < pageProgress.total) {
    const remaining = pageProgress.total - pageProgress.done;
    blockers.push(`${remaining} ${remaining === 1 ? 'page is' : 'pages are'} still in progress`);
  }
  if (pageProgress.blocked > 0) {
    blockers.push(`${pageProgress.blocked} ${pageProgress.blocked === 1 ? 'page is' : 'pages are'} blocked`);
  }
  if (siteChecks.pending > 0) blockers.push(`${siteChecks.pending} launch checklist items outstanding`);
  if (pageChecks.failed > 0) blockers.push(`${pageChecks.failed} page checks failing`);
  if (pageChecks.pending > 0) blockers.push(`${pageChecks.pending} page checks unanswered`);

  return {
    pages: pageProgress,
    siteChecks,
    pageChecks,
    postLaunchChecks,
    ready: blockers.length === 0,
    blockers,
  };
}

/**
 * The per-page QC questions for a project: whatever the team has set, or the
 * stack's starting set until they change them.
 */
export function pageChecksFor(
  stack: StackDefinition,
  delivery: ProjectDeliveryState | undefined,
): StackCheck[] {
  const saved = delivery?.pageChecks;
  const checks = saved && saved.length > 0 ? saved : stack.defaultPageChecks;
  // A saved signal is whatever was written to the document, so it is validated
  // here rather than trusted: an unknown one is dropped, which turns the check
  // into an ordinary question a person answers instead of one that looks
  // automatic and never resolves.
  return [...checks]
    .sort((a, b) => a.order - b.order)
    .map((check) => (check.auto && !isAutoCheckId(check.auto) ? { ...check, auto: undefined } : check));
}
