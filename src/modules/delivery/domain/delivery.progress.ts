import type { AuditResult } from '@/types';
import {
  SETTLED_PAGE_STATUSES,
  normalizePageWorkStatus,
  type AutoCheckId,
  type AutoCheckVerdict,
  type CheckStatus,
  type ProjectDeliveryState,
  type ProjectPage,
  type StackCheck,
  type StackDefinition,
  type StackKickoffStep,
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
  stack: StackDefinition;
  pages: ProjectPage[];
  delivery: ProjectDeliveryState | undefined;
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
export function buildLaunchReadiness(input: BuildLaunchReadinessInput): LaunchReadiness {
  const { stack, pages, delivery, auditsByPageId = {} } = input;

  const pageProgress = buildPageProgress(stack, pages);

  const siteCheckDefs = stack.checks.filter((c) => c.scope === 'site' && !c.postLaunch);
  const postLaunchDefs = stack.checks.filter((c) => c.scope === 'site' && c.postLaunch);
  const pageCheckDefs = stack.checks.filter((c) => c.scope === 'page');

  const siteAnswers = delivery?.siteChecks ?? {};
  const resolveSite = (defs: StackCheck[]) =>
    defs.map((check) => resolveCheck(check, siteAnswers[check.id], undefined));

  const siteChecks = tally(resolveSite(siteCheckDefs));
  const postLaunchChecks = tally(resolveSite(postLaunchDefs));

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
  if (siteChecks.failed > 0) blockers.push(`${siteChecks.failed} site checks failing`);
  if (siteChecks.pending > 0) blockers.push(`${siteChecks.pending} site checks unanswered`);
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

/** Whether the client has given us everything the build needs to start. */
export function buildKickoffProgress(
  stack: StackDefinition,
  delivery: ProjectDeliveryState | undefined,
): { done: number; total: number; outstanding: string[]; complete: boolean } {
  const answers = delivery?.kickoffInputs ?? {};
  const required = stack.kickoffInputs.filter((i) => !i.optional);
  const outstanding = required.filter((i) => answers[i.id] !== true).map((i) => i.title);
  return {
    done: required.length - outstanding.length,
    total: required.length,
    outstanding,
    complete: outstanding.length === 0,
  };
}

/** What the app already knows about our own kickoff, without anyone ticking. */
export interface KickoffContext {
  /** A tracker sheet has been generated for this project. */
  hasTrackerSheet: boolean;
  /** Pages are on the tracker, so the page list has plainly been pulled. */
  pageCount: number;
}

/**
 * Whether a kickoff step is done: what someone ticked, or what the project
 * already shows. A tick always wins, so a step can be marked done even when the
 * app cannot see it (a call held, a channel created).
 */
export function resolveKickoffStep(
  step: StackKickoffStep,
  ticked: boolean | undefined,
  delivery: ProjectDeliveryState | undefined,
  context: KickoffContext,
): { done: boolean; source: 'person' | 'project' } {
  if (ticked === true) return { done: true, source: 'person' };
  switch (step.auto) {
    case 'tracker_shared':
      if (context.hasTrackerSheet) return { done: true, source: 'project' };
      break;
    case 'cadence_set':
      if (delivery?.callCadence && delivery.callCadence !== 'none') return { done: true, source: 'project' };
      break;
    case 'pages_listed':
      if (context.pageCount > 0) return { done: true, source: 'project' };
      break;
    default:
      break;
  }
  return { done: false, source: 'person' };
}

export interface KickoffStepProgress {
  done: number;
  total: number;
  outstanding: string[];
  complete: boolean;
}

/** Our side of kickoff: the calls, the channel, the welcome email, the setup. */
export function buildKickoffStepProgress(
  stack: StackDefinition,
  delivery: ProjectDeliveryState | undefined,
  context: KickoffContext,
): KickoffStepProgress {
  const ticks = delivery?.kickoffSteps ?? {};
  const outstanding = stack.kickoffSteps
    .filter((step) => !resolveKickoffStep(step, ticks[step.id], delivery, context).done)
    .map((step) => step.title);
  return {
    done: stack.kickoffSteps.length - outstanding.length,
    total: stack.kickoffSteps.length,
    outstanding,
    complete: outstanding.length === 0,
  };
}

/**
 * Kickoff as a whole: what the client owes us and what we owe the project.
 *
 * `readyToBuild` is the narrower question — the build is blocked on the client's
 * inputs, not on whether we have held our internal kickoff yet.
 */
export function buildKickoffState(
  stack: StackDefinition,
  delivery: ProjectDeliveryState | undefined,
  context: KickoffContext,
): {
  inputs: ReturnType<typeof buildKickoffProgress>;
  steps: KickoffStepProgress;
  done: number;
  total: number;
  complete: boolean;
  readyToBuild: boolean;
} {
  const inputs = buildKickoffProgress(stack, delivery);
  const steps = buildKickoffStepProgress(stack, delivery, context);
  return {
    inputs,
    steps,
    done: inputs.done + steps.done,
    total: inputs.total + steps.total,
    complete: inputs.complete && steps.complete,
    readyToBuild: inputs.complete,
  };
}
