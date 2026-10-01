import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientPortalView } from './client-portal.projection';
import { CLIENT_PORTAL_VIEW_KEYS } from './client-portal.types';
import { readProjectSheet } from './project-sheet.read';
import { sheetStageSources } from './project-sheet.portal';
import { ACTIVESET_SHEET, DIFFERENT_AI, TODAY, WEBFLOW_TEMPLATE } from './project-sheet.fixtures';
import type { ProjectSheetSnapshot } from './project-sheet.types';
import type { Project, ProjectTimeline, Task } from '@/types';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_1',
    name: 'Website build',
    status: 'current',
    client: 'Northwind',
    links: [],
    clientPortal: { enabled: true },
    createdAt: new Date('2026-08-30'),
    updatedAt: new Date('2026-09-01'),
    ...overrides,
  } as Project;
}

function snapshot(overrides: Partial<ProjectSheetSnapshot> = {}): ProjectSheetSnapshot {
  return {
    data: readProjectSheet(DIFFERENT_AI, { today: TODAY }).data,
    url: 'https://docs.google.com/spreadsheets/d/abc123/edit',
    syncedAt: '2026-09-10T09:00:00.000Z',
    changedAt: '2026-09-10T08:00:00.000Z',
    ...overrides,
  };
}

const appTimeline: ProjectTimeline = {
  id: 'proj_1',
  projectId: 'proj_1',
  phases: [{ id: 'ph_a', title: 'App phase', order: 0 }],
  milestones: [{ id: 'm1', title: 'App milestone', phaseId: 'ph_a', status: 'in_progress', startDate: '2026-09-01', endDate: '2026-09-05', order: 0 }],
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
};

const view = (sheet: ProjectSheetSnapshot | null, extra: { timeline?: ProjectTimeline | null; tasks?: Task[]; project?: Partial<Project> } = {}) =>
  buildClientPortalView({
    project: project(extra.project),
    timeline: extra.timeline ?? null,
    tasks: extra.tasks,
    sheet,
    now: new Date('2026-09-10T09:00:00.000Z'),
  });

describe('buildClientPortalView with a project sheet', () => {
  it('takes its stages from the sheet Timeline, with whose step each milestone is', () => {
    const v = view(snapshot());
    assert.equal(v.planSource, 'sheet');
    assert.deepEqual(v.stages.map((s) => [s.title, s.state]), [
      ['Foundation and motion direction', 'done'],
      ['Core pages and animation production', 'current'],
      ['Remaining pages, integrations and motion', 'upcoming'],
      ['QA, review and launch', 'upcoming'],
    ]);
    assert.equal(v.currentStageIndex, 1);
    assert.equal(v.stages[0].startDate, '2026-08-31');
    assert.equal(v.stages[1].percent, 0);
    assert.deepEqual(v.stages[0].steps!.map((s) => s.owner ?? 'team'), ['both', 'client', 'team']);
  });

  it('dates a stage from its phase when its milestones have no dates', () => {
    const [stage] = sheetStageSources({
      phases: [{ key: '1', title: 'Foundation', start: { iso: '2026-08-31' }, end: { iso: '2026-09-06' }, milestones: [{ id: 'm', title: 'Kickoff', state: 'not_started' }] }],
    });
    assert.equal(stage.stage.startDate, '2026-08-31');
    assert.equal(stage.stage.dueDate, '2026-09-06');
  });

  it('wins over the app Timeline, unless the team chose the app one', () => {
    assert.equal(view(snapshot(), { timeline: appTimeline }).planSource, 'sheet');
    const app = view(snapshot({ stagesFrom: 'app' }), { timeline: appTimeline });
    assert.equal(app.planSource, 'timeline');
    assert.deepEqual(app.stages.map((s) => s.title), ['App phase']);
    // Choosing the app's Timeline when it is empty still leaves the client a plan.
    assert.equal(view(snapshot({ stagesFrom: 'app' })).planSource, 'sheet');
  });

  it('adds work, asks, changes and readiness from the sheet', () => {
    const v = view(snapshot());
    assert.deepEqual(v.work!.map((w) => [w.title, w.items.length]), [['Page Tracker', 5], ['Lottie Tracker', 2]]);
    const home = v.work![0].items.find((i) => i.title === 'Home')!;
    assert.equal(home.state, 'in_review');
    assert.equal(home.stageId, v.stages[1].id, 'Phase 2 rows sit in the Phase 2 stage');
    assert.deepEqual(home.links.map((l) => l.title), ['Design', 'Staging']);

    assert.deepEqual(v.asks.map((a) => [a.title.slice(0, 18), a.kind, a.dueDate]), [
      ['Pricing page: in s', 'decision', '2026-08-31'],
      ['Founder photos, pr', 'input', '2026-09-07'],
      ['HubSpot: portal ac', 'input', '2026-09-10'],
    ]);
    assert.equal(v.asksReceived, 1);
    assert.deepEqual(v.changes!.map((c) => [c.ref, c.state, c.estimate]), [['CR-01', 'proposed', '$350'], ['CR-02', 'approved', '$250']]);
    assert.deepEqual(v.readiness!.map((r) => [r.title, r.done, r.total]), [['Launch checklist', 1, 3], ['SEO tags', 1, 3], ['Redirects mapped', 1, 2]]);
    assert.equal(v.facts!.targetLaunchDate, '2026-09-27');
    assert.deepEqual(v.files.map((f) => f.title), ['Figma / design source', 'Webflow staging', 'HubSpot portal']);
    assert.equal(v.lastUpdateAt, '2026-09-10T08:00:00.000Z');
  });

  it('links the client to the sheet only when the team says so', () => {
    const template = { data: readProjectSheet(WEBFLOW_TEMPLATE, { today: TODAY }).data, url: 'https://docs.google.com/spreadsheets/d/xyz/edit' };
    const off = view(template);
    assert.equal(off.sheetUrl, undefined);
    const seoAsk = off.asks.find((a) => a.kind === 'fill' && a.title === 'Fill in SEO Tags')!;
    assert.deepEqual(seoAsk.progress, { done: 1, total: 3 });
    assert.equal(seoAsk.url, undefined);
    assert.equal(off.files.some((f) => f.id === 'project-sheet'), false);

    const on = view({ ...template, showSheetLink: true });
    assert.equal(on.sheetUrl, template.url);
    assert.equal(on.asks.find((a) => a.kind === 'fill')!.url, template.url);
    assert.equal(on.files[0].title, 'Project sheet');
  });

  it('shows a task ask once when it repeats a sheet input', () => {
    const task = {
      id: 't1', projectId: 'proj_1', title: 'HubSpot: portal access or form embed IDs (up to 3 forms)', status: 'todo',
      needsClientInput: true, order: 0, createdAt: new Date(), updatedAt: new Date(),
    } as unknown as Task;
    const other = { ...task, id: 't2', title: 'Send the logo files' } as Task;
    const v = view(snapshot(), { tasks: [task, other] });
    assert.equal(v.asks.filter((a) => a.title.startsWith('HubSpot')).length, 1);
    assert.ok(v.asks.some((a) => a.id === 't2'));
  });

  it('emits only allow-listed keys, all the way down', () => {
    const v = view(snapshot({ showSheetLink: true }));
    const allowed = new Set<string>(CLIENT_PORTAL_VIEW_KEYS);
    for (const key of Object.keys(v)) assert.ok(allowed.has(key), `unexpected key on portal view: ${key}`);
    const check = (obj: object, keys: string[], where: string) => {
      for (const key of Object.keys(obj)) assert.ok(keys.includes(key), `unexpected key on ${where}: ${key}`);
    };
    for (const stage of v.stages) for (const step of stage.steps ?? []) check(step, ['id', 'title', 'state', 'startDate', 'endDate', 'owner', 'waiting', 'url', 'note'], 'a milestone');
    for (const ask of v.asks) check(ask, ['id', 'title', 'dueDate', 'dueText', 'why', 'group', 'owner', 'url', 'kind', 'progress'], 'an ask');
    for (const stream of v.work ?? []) {
      check(stream, ['id', 'title', 'tracks', 'items'], 'a workstream');
      for (const item of stream.items) check(item, ['id', 'title', 'group', 'stageId', 'state', 'states', 'targetDate', 'targetText', 'links'], 'a work item');
    }
    for (const change of v.changes ?? []) check(change, ['id', 'ref', 'title', 'state', 'raisedDate', 'affects', 'estimate', 'days'], 'a change');
    for (const r of v.readiness ?? []) check(r, ['id', 'title', 'done', 'total', 'groups'], 'a readiness row');
    check(v.facts!, ['engagement', 'kickoffDate', 'targetLaunchDate', 'targetLaunchText'], 'the facts');
  });

  it('never carries notes, assignees, contacts or money out of the sheet', () => {
    const json = JSON.stringify(view(snapshot({ showSheetLink: true })));
    for (const secret of ['SECRET-NOTE', 'Arth', 'Tejas', 'rehan@activeset.co', 'sam@northwind', '4,500', '50% to commence', 'Rehan + Client']) {
      assert.equal(json.includes(secret), false, `portal JSON leaked "${secret}"`);
    }
  });

  it('gives phases that slug alike, or have no Latin letters, their own stage ids', () => {
    const milestone = (id: string) => ({ id, title: id, state: 'not_started' as const });
    const ids = sheetStageSources({
      phases: [
        { key: 'Phase 1 – Design', title: 'Design', milestones: [milestone('a')] },
        { key: 'Phase 1 - Design', title: 'Design again', milestones: [milestone('b')] },
        { key: 'डिज़ाइन', title: 'डिज़ाइन', milestones: [milestone('c')] },
        { key: 'विकास', title: 'विकास', milestones: [milestone('d')] },
      ],
    }).map((s) => s.stage.id);
    assert.equal(new Set(ids).size, 4, `ids collided: ${ids.join(', ')}`);
  });

  it('shows the ActiveSet sheet as a process: where we are, and what waits on the client', () => {
    const v = view({ data: readProjectSheet(ACTIVESET_SHEET, { today: TODAY }).data, url: 'https://docs.google.com/spreadsheets/d/x/edit' });
    assert.equal(v.planSource, 'sheet');
    assert.deepEqual(v.stages.map((s) => [s.title, s.state]), [
      ['Kickoff', 'done'], ['Brand Design', 'current'], ['Web Design', 'upcoming'], ['Development', 'upcoming'], ['Launch', 'upcoming'],
      ['Handover', 'upcoming'],
    ]);
    const brand = v.stages[1].steps!;
    assert.equal(brand.some((s) => s.title === 'Logo & identity revisions'), false, 'a skipped step is out of scope and hidden');
    const feedback = brand.find((s) => s.title === 'Feedback on moodboard')!;
    assert.deepEqual(
      { state: feedback.state, waiting: feedback.waiting, url: feedback.url, note: feedback.note, endDate: feedback.endDate },
      { state: 'current', waiting: true, url: 'https://www.figma.com/board/moodboard', note: 'Two directions: pick one, or mix them', endDate: '2026-09-12' },
    );
    assert.equal(brand.find((s) => s.title === 'Moodboarding')!.waiting, undefined);
  });

  it('changes nothing for a project without a sheet', () => {
    const without = view(null, { timeline: appTimeline });
    assert.equal(without.planSource, 'timeline');
    for (const key of ['facts', 'work', 'changes', 'readiness', 'sheetUrl', 'asksReceived']) {
      assert.equal(key in without, false, `${key} should be absent`);
    }
  });
});
