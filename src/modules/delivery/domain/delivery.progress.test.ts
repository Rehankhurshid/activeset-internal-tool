import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLaunchReadiness,
  pageChecksFor,
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
  const autoCheck = stack.defaultPageChecks.find((c) => c.id === 'page_title') as StackCheck;
  const manualCheck = stack.defaultPageChecks.find((c) => c.id === 'headings') as StackCheck;
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
  const checks = stack.defaultPageChecks;
  const answerPage = () => Object.fromEntries(checks.map((c) => [c.id, 'passed' as const]));
  const launchItem = (status: 'not_started' | 'completed' | 'skipped', title = 'Connect the domain') =>
    ({ id: `i_${title}_${status}`, title, status, order: 0 }) as never;
  const run = (over: Record<string, unknown> = {}) =>
    buildLaunchReadiness(
      { pages: [], pageChecks: checks, ...over } as never,
      stack.disciplines,
    );

  it('is not ready with no pages, and says so', () => {
    const r = run();
    assert.equal(r.ready, false);
    assert.ok(r.blockers.includes('No pages added yet'));
  });

  it('is ready when pages are built and the launch checklist is done', () => {
    const r = run({
      pages: [page('home', ALL_DONE, { qc: answerPage() })],
      launchChecklistItems: [launchItem('completed')],
    });
    assert.deepEqual(r.blockers, []);
    assert.equal(r.ready, true);
  });

  it('counts a skipped checklist item as not applicable, not as done', () => {
    const r = run({
      pages: [page('home', ALL_DONE, { qc: answerPage() })],
      launchChecklistItems: [launchItem('skipped')],
    });
    assert.equal(r.siteChecks.applicable, 0, 'skipped drops out of the denominator');
    assert.equal(r.ready, true);
  });

  it('names an outstanding checklist item as a blocker', () => {
    const r = run({
      pages: [page('home', ALL_DONE, { qc: answerPage() })],
      launchChecklistItems: [launchItem('not_started')],
    });
    assert.equal(r.ready, false);
    assert.ok(r.blockers.some((b) => b.includes('launch checklist items outstanding')));
  });

  it('is ready with no launch checklist at all — an untagged project is not blocked here', () => {
    // Whether the stage is set up is the UI's story to tell; readiness only
    // reports what it was given.
    const r = run({ pages: [page('home', ALL_DONE, { qc: answerPage() })] });
    assert.equal(r.ready, true);
  });

  it('counts a scan failure as a failing page check without anyone answering', () => {
    const r = run({
      pages: [page('home', ALL_DONE)],
      auditsByPageId: { home: { categories: { seo: { title: '', imagesWithoutAlt: 4 } } } },
    });
    assert.ok(r.pageChecks.failed >= 2, 'missing title and alt text both counted');
    assert.equal(r.ready, false);
  });
});

describe('stack registry', () => {
  it('falls back to Webflow for an unset or unsupported stack', () => {
    assert.equal(getStack(undefined).id, 'webflow');
    assert.equal(getStack('astro-sanity').id, 'webflow');
  });

  it('gives every check and discipline a unique id', () => {
    const disciplineIds = stack.disciplines.map((d) => d.id);
    assert.equal(new Set(disciplineIds).size, disciplineIds.length, 'duplicate discipline id');
    const checkIds2 = stack.defaultPageChecks.map((c) => c.id);
    assert.equal(new Set(checkIds2).size, checkIds2.length, 'duplicate page check id');
  });
});

describe('pageChecksFor', () => {
  it('falls back to the stack until the project saves its own', () => {
    assert.deepEqual(
      pageChecksFor(stack, undefined).map((c) => c.id),
      stack.defaultPageChecks.map((c) => c.id),
    );
    assert.deepEqual(pageChecksFor(stack, { pageChecks: [] }).map((c) => c.id), stack.defaultPageChecks.map((c) => c.id));
  });

  it('uses the project list once there is one, in its own order', () => {
    const custom = [
      { id: 'b', title: 'Second', group: 'QA', order: 1 },
      { id: 'a', title: 'First', group: 'QA', order: 0 },
    ];
    assert.deepEqual(pageChecksFor(stack, { pageChecks: custom }).map((c) => c.id), ['a', 'b']);
  });
});
