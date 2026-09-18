import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKickoffProgress,
  buildKickoffState,
  resolveKickoffStep,
  buildLaunchReadiness,
  buildPageProgress,
  resolveAutoCheck,
  resolveCheck,
} from './delivery.progress';
import { WEBFLOW_STACK } from './stacks/webflow.stack';
import { getStack } from './stacks';
import type { ProjectPage, StackCheck } from './delivery.types';
import type { AuditResult } from '@/types';

const stack = WEBFLOW_STACK;

function page(id: string, work: Record<string, string>, extra: Partial<ProjectPage> = {}): ProjectPage {
  return {
    id,
    path: `/${id}`,
    title: id,
    order: 0,
    work: work as ProjectPage['work'],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

const ALL_DONE = { copy: 'completed', design: 'completed', dev_desktop: 'completed', dev_mobile: 'completed' };

describe('buildPageProgress', () => {
  it('counts a page done only when every applicable discipline is settled', () => {
    const pages = [
      page('a', ALL_DONE),
      page('b', { ...ALL_DONE, dev_mobile: 'in_progress' }),
      page('c', {}),
    ];
    const progress = buildPageProgress(stack, pages);
    assert.equal(progress.total, 3);
    assert.equal(progress.done, 1);
  });

  it('treats not_required as settled rather than outstanding', () => {
    // A CMS template legitimately needs no copy work; counting it as outstanding
    // would leave the project permanently at 90%.
    const pages = [page('a', { ...ALL_DONE, copy: 'not_required' })];
    const progress = buildPageProgress(stack, pages);
    assert.equal(progress.done, 1);
    const copy = progress.disciplines.find((d) => d.disciplineId === 'copy');
    assert.equal(copy?.applicable, 0, 'not_required drops out of the denominator');
    assert.equal(copy?.done, 0);
  });

  it('does not count a page as done when every discipline is not_required', () => {
    const pages = [
      page('a', { copy: 'not_required', design: 'not_required', dev_desktop: 'not_required', dev_mobile: 'not_required' }),
    ];
    assert.equal(buildPageProgress(stack, pages).done, 0);
  });

  it('reports blocked pages separately from unfinished ones', () => {
    const pages = [page('a', { ...ALL_DONE, design: 'blocked' }), page('b', ALL_DONE)];
    const progress = buildPageProgress(stack, pages);
    assert.equal(progress.blocked, 1);
    assert.equal(progress.done, 1);
  });

  it('returns disciplines in the stack order', () => {
    const progress = buildPageProgress(stack, [page('a', ALL_DONE)]);
    assert.deepEqual(progress.disciplines.map((d) => d.disciplineId), ['copy', 'design', 'dev_desktop', 'dev_mobile']);
  });
});

describe('resolveAutoCheck', () => {
  const audit = (partial: Record<string, unknown>) => partial as unknown as AuditResult;

  it('says unknown when the page has never been scanned', () => {
    for (const id of ['page_title', 'meta_description', 'image_alt', 'open_graph', 'links_resolve', 'schema', 'spelling'] as const) {
      assert.equal(resolveAutoCheck(id, undefined), 'unknown', `${id} with no audit`);
    }
  });

  it('distinguishes a missing title from an unscanned page', () => {
    assert.equal(resolveAutoCheck('page_title', audit({ categories: { seo: { title: 'Pricing' } } })), 'pass');
    assert.equal(resolveAutoCheck('page_title', audit({ categories: { seo: { title: '   ' } } })), 'fail');
    assert.equal(resolveAutoCheck('page_title', audit({ categories: {} })), 'unknown');
  });

  it('reads alt text from the image count', () => {
    assert.equal(resolveAutoCheck('image_alt', audit({ categories: { seo: { imagesWithoutAlt: 0 } } })), 'pass');
    assert.equal(resolveAutoCheck('image_alt', audit({ categories: { seo: { imagesWithoutAlt: 3 } } })), 'fail');
  });

  it('only trusts the link check once links have actually been checked', () => {
    // An empty brokenLinks array means nothing if the crawl never ran.
    assert.equal(resolveAutoCheck('links_resolve', audit({ categories: { links: { brokenLinks: [] } } })), 'unknown');
    assert.equal(
      resolveAutoCheck('links_resolve', audit({ categories: { links: { brokenLinks: [], checkedAt: '2026-09-01' } } })),
      'pass',
    );
    assert.equal(
      resolveAutoCheck('links_resolve', audit({ categories: { links: { brokenLinks: [{ href: '/x' }], checkedAt: '2026-09-01' } } })),
      'fail',
    );
  });

  it('falls back to the content snapshot for title and description', () => {
    const snap = audit({ categories: {}, contentSnapshot: { title: 'T', h1: 'H', metaDescription: 'D' } });
    assert.equal(resolveAutoCheck('page_title', snap), 'pass');
    assert.equal(resolveAutoCheck('meta_description', snap), 'pass');
    assert.equal(resolveAutoCheck('single_h1', snap), 'pass');
    assert.equal(resolveAutoCheck('single_h1', audit({ contentSnapshot: { title: 'T', h1: '', metaDescription: 'D' } })), 'fail');
  });
});

describe('resolveCheck', () => {
  const autoCheck = stack.checks.find((c) => c.id === 'page_title') as StackCheck;
  const manualCheck = stack.checks.find((c) => c.id === 'headings') as StackCheck;
  const failing = { categories: { seo: { title: '' } } } as unknown as AuditResult;

  it("lets a person's answer override the scan", () => {
    const result = resolveCheck(autoCheck, 'passed', failing);
    assert.deepEqual(result, { status: 'passed', source: 'person' });
  });

  it('falls back to the scan when nobody has answered', () => {
    assert.deepEqual(resolveCheck(autoCheck, undefined, failing), { status: 'failed', source: 'scan' });
    assert.deepEqual(resolveCheck(autoCheck, 'pending', failing), { status: 'failed', source: 'scan' });
  });

  it('stays pending for checks no scan can answer', () => {
    assert.deepEqual(resolveCheck(manualCheck, undefined, failing), { status: 'pending', source: 'none' });
  });
});

describe('buildLaunchReadiness', () => {
  const answerAll = (value: 'passed' | 'not_required') =>
    Object.fromEntries(stack.checks.filter((c) => c.scope === 'site' && !c.postLaunch).map((c) => [c.id, value]));
  const answerPage = () =>
    Object.fromEntries(stack.checks.filter((c) => c.scope === 'page').map((c) => [c.id, 'passed' as const]));

  it('is not ready with no pages, and says so', () => {
    const r = buildLaunchReadiness({ stack, pages: [], delivery: { siteChecks: answerAll('passed') } });
    assert.equal(r.ready, false);
    assert.ok(r.blockers.includes('No pages added yet'));
  });

  it('is ready when pages are built and every pre-launch check passes', () => {
    const pages = [page('home', ALL_DONE, { qc: answerPage() })];
    const r = buildLaunchReadiness({ stack, pages, delivery: { siteChecks: answerAll('passed') } });
    assert.deepEqual(r.blockers, []);
    assert.equal(r.ready, true);
  });

  it('does not let outstanding post-launch checks block the launch', () => {
    const pages = [page('home', ALL_DONE, { qc: answerPage() })];
    const r = buildLaunchReadiness({ stack, pages, delivery: { siteChecks: answerAll('passed') } });
    assert.equal(r.ready, true);
    assert.ok(r.postLaunchChecks.pending > 0, 'post-launch work is still tracked');
  });

  it('names what is holding the launch up', () => {
    const pages = [page('home', { ...ALL_DONE, dev_mobile: 'in_progress' }), page('about', ALL_DONE, { qc: answerPage() })];
    const r = buildLaunchReadiness({ stack, pages, delivery: {} });
    assert.equal(r.ready, false);
    assert.ok(r.blockers.some((b) => b.includes('1 page is still in progress')));
    assert.ok(r.blockers.some((b) => b.includes('site checks unanswered')));
  });

  it('counts a scan failure as a failing page check without anyone answering', () => {
    const pages = [page('home', ALL_DONE)];
    const audits = { home: { categories: { seo: { title: '', imagesWithoutAlt: 4 } } } as unknown as AuditResult };
    const r = buildLaunchReadiness({ stack, pages, delivery: { siteChecks: answerAll('passed') }, auditsByPageId: audits });
    assert.ok(r.pageChecks.failed >= 2, 'missing title and alt text both counted');
    assert.equal(r.ready, false);
  });

  it('drops not_required checks out of the denominator', () => {
    const r = buildLaunchReadiness({ stack, pages: [], delivery: { siteChecks: answerAll('not_required') } });
    assert.equal(r.siteChecks.applicable, 0);
    assert.equal(r.siteChecks.pending, 0);
  });
});

describe('buildKickoffProgress', () => {
  it('ignores optional inputs and lists what is outstanding', () => {
    const required = stack.kickoffInputs.filter((i) => !i.optional);
    const progress = buildKickoffProgress(stack, { kickoffInputs: {} });
    assert.equal(progress.total, required.length);
    assert.equal(progress.done, 0);
    assert.equal(progress.complete, false);
    assert.equal(progress.outstanding.length, required.length);

    const all = Object.fromEntries(required.map((i) => [i.id, true]));
    const done = buildKickoffProgress(stack, { kickoffInputs: all });
    assert.equal(done.complete, true);
    assert.deepEqual(done.outstanding, []);
  });
});

describe('kickoff steps', () => {
  const noContext = { hasTrackerSheet: false, pageCount: 0 };
  const step = (id: string) => stack.kickoffSteps.find((s) => s.id === id)!;

  it('covers the things the team actually does first', () => {
    const ids = stack.kickoffSteps.map((s) => s.id);
    for (const expected of ['kickoff_call_booked', 'kickoff_call_held', 'slack_channel', 'welcome_email']) {
      assert.ok(ids.includes(expected), `missing kickoff step: ${expected}`);
    }
  });

  it('answers itself where the project already shows the answer', () => {
    assert.equal(resolveKickoffStep(step('tracker_shared'), undefined, {}, noContext).done, false);
    assert.deepEqual(
      resolveKickoffStep(step('tracker_shared'), undefined, {}, { hasTrackerSheet: true, pageCount: 0 }),
      { done: true, source: 'project' },
    );
    assert.deepEqual(
      resolveKickoffStep(step('page_list'), undefined, {}, { hasTrackerSheet: false, pageCount: 12 }),
      { done: true, source: 'project' },
    );
    assert.deepEqual(
      resolveKickoffStep(step('cadence_agreed'), undefined, { callCadence: 'weekly' }, noContext),
      { done: true, source: 'project' },
    );
    // "none" is a decision not to have a standing call, not a cadence.
    assert.equal(resolveKickoffStep(step('cadence_agreed'), undefined, { callCadence: 'none' }, noContext).done, false);
  });

  it('lets a tick stand for things the app cannot see', () => {
    assert.deepEqual(resolveKickoffStep(step('slack_channel'), true, {}, noContext), { done: true, source: 'person' });
    assert.equal(resolveKickoffStep(step('slack_channel'), undefined, {}, noContext).done, false);
  });

  it('reports our side separately from the client side', () => {
    const state = buildKickoffState(stack, {}, noContext);
    assert.equal(state.steps.total, stack.kickoffSteps.length);
    assert.equal(state.steps.done, 0);
    assert.equal(state.complete, false);
    assert.equal(state.readyToBuild, false);
    assert.equal(state.total, state.inputs.total + state.steps.total);
  });

  it('can be ready to build while our own setup is still outstanding', () => {
    // The build is blocked on the client's inputs, not on our internal kickoff.
    const inputs = Object.fromEntries(stack.kickoffInputs.filter((i) => !i.optional).map((i) => [i.id, true]));
    const state = buildKickoffState(stack, { kickoffInputs: inputs }, noContext);
    assert.equal(state.readyToBuild, true);
    assert.equal(state.complete, false, 'our own steps are still outstanding');
    assert.ok(state.steps.outstanding.length > 0);
  });

  it('is complete only when both sides are', () => {
    const inputs = Object.fromEntries(stack.kickoffInputs.filter((i) => !i.optional).map((i) => [i.id, true]));
    const steps = Object.fromEntries(stack.kickoffSteps.map((s) => [s.id, true]));
    const state = buildKickoffState(stack, { kickoffInputs: inputs, kickoffSteps: steps }, noContext);
    assert.equal(state.complete, true);
    assert.deepEqual(state.steps.outstanding, []);
  });
});

describe('stack registry', () => {
  it('falls back to Webflow for an unset or unsupported stack', () => {
    assert.equal(getStack(undefined).id, 'webflow');
    assert.equal(getStack('astro-sanity').id, 'webflow');
  });

  it('gives every check and discipline a unique id', () => {
    const checkIds = stack.checks.map((c) => c.id);
    assert.equal(new Set(checkIds).size, checkIds.length, 'duplicate check id');
    const disciplineIds = stack.disciplines.map((d) => d.id);
    assert.equal(new Set(disciplineIds).size, disciplineIds.length, 'duplicate discipline id');
    const inputIds = stack.kickoffInputs.map((i) => i.id);
    assert.equal(new Set(inputIds).size, inputIds.length, 'duplicate kickoff input id');
    const stepIds = stack.kickoffSteps.map((s) => s.id);
    assert.equal(new Set(stepIds).size, stepIds.length, 'duplicate kickoff step id');
  });
});
