import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AGENCY_CLOSE, AGENCY_START, SOP_TEMPLATES } from '@/lib/sop-templates';
import type { ChecklistItemStatus, ClientPlan, ProjectChecklist, ProjectTimeline } from '@/types';
import {
  PLAN_COMPLETE,
  classifySections,
  draftClientPlan,
  legacyClientPlan,
  normalizeClientPlan,
  planStageKinds,
  resolveClientPlan,
  safeHttpUrl,
  spreadStageDates,
  type PlanSection,
} from './client-plan';

/** A template's sections as a new project's checklist has them: agency start and close around them. */
function withAgencyBasics(templateId: string): PlanSection[] {
  const template = SOP_TEMPLATES.find((t) => t.id === templateId);
  assert.ok(template, `missing built-in template ${templateId}`);
  return [AGENCY_START, ...template.sections, AGENCY_CLOSE];
}

const titled = (...titles: string[]): PlanSection[] => titles.map((title) => ({ title }));

describe('which client stage a checklist section belongs to', () => {
  it('reads the Webflow migration SOP as the seven stages a client would name', () => {
    const sections = withAgencyBasics('webflow_migration_v1');
    const kinds = classifySections(sections);
    const byTitle = Object.fromEntries(sections.map((s, i) => [s.title, kinds[i]]));
    assert.equal(byTitle['Start: client setup'], 'kickoff');
    assert.equal(byTitle['Input'], 'kickoff');
    assert.equal(byTitle['Step 1: Project Planning'], 'discovery');
    assert.equal(byTitle['Step 2: Design Preparation (Developer)'], 'design');
    assert.equal(byTitle['Step 3: Webflow Project Setup'], 'build');
    assert.equal(byTitle['Step 5: Page Development & Layout'], 'build');
    assert.equal(byTitle['Step 7: QA & Pre-Launch Checklist'], 'review');
    assert.equal(byTitle['Step 8: Client Review'], 'review');
    assert.equal(byTitle['Step 9: Launch'], 'launch');
    assert.equal(byTitle['Close: handover & sign-off'], 'handover');
    assert.deepEqual(planStageKinds(sections), ['kickoff', 'discovery', 'design', 'build', 'review', 'launch', 'handover']);
  });

  it('gives a brand project no build or launch it does not have', () => {
    assert.deepEqual(planStageKinds(withAgencyBasics('branding_v1')), ['kickoff', 'discovery', 'design', 'handover']);
  });

  it('keeps a review partway through with the stage it reviews', () => {
    const kinds = classifySections(titled('Kickoff', 'UI design', 'Design review', 'Development', 'QA', 'Go live'));
    assert.deepEqual(kinds, ['kickoff', 'design', 'design', 'build', 'review', 'launch']);
  });

  it('treats a review with no build ahead of it as the client review', () => {
    const kinds = classifySections(titled('Brief', 'Moodboards', 'Client review', 'Brand book handover'));
    assert.deepEqual(kinds, ['kickoff', 'design', 'review', 'handover']);
  });

  it('never walks backwards, and gives a silent title to the stage before it', () => {
    assert.deepEqual(classifySections(titled('Kickoff', 'Development', 'SEO audit', 'Odds and ends')), [
      'kickoff',
      'build',
      'build',
      'build',
    ]);
    assert.deepEqual(classifySections(titled('Welcome', 'Misc')), ['kickoff', 'kickoff']);
  });

  it('falls back on the section role when the title says nothing', () => {
    const kinds = classifySections([{ title: 'Week one' }, { title: 'The big day', role: 'launch' }]);
    assert.deepEqual(kinds, ['kickoff', 'launch']);
  });

  it('uses the standard stages when there is no checklist', () => {
    assert.deepEqual(planStageKinds([]), ['kickoff', 'design', 'build', 'review', 'launch', 'handover']);
  });
});

describe('drafting a plan', () => {
  it('dates the stages back to back from the start date', () => {
    const plan = draftClientPlan(withAgencyBasics('webflow_migration_v1'), {
      startDate: '2026-10-01',
      templateId: 'webflow_migration_v1',
    });
    assert.equal(plan.templateId, 'webflow_migration_v1');
    assert.deepEqual(plan.stages.map((s) => s.title), ['Kickoff', 'Discovery', 'Design', 'Build', 'Review', 'Launch', 'Handover']);
    assert.equal(plan.stages[0].startDate, '2026-10-01');
    assert.equal(plan.stages[0].dueDate, '2026-10-05');
    for (let i = 1; i < plan.stages.length; i += 1) {
      const prevDue = new Date(`${plan.stages[i - 1].dueDate}T00:00:00Z`).getTime();
      const start = new Date(`${plan.stages[i].startDate}T00:00:00Z`).getTime();
      assert.equal(start - prevDue, 86_400_000, `stage ${i} should start the day after the one before ends`);
    }
    assert.ok(plan.stages.every((s) => s.deliverables.length > 0 && s.files.length === 0 && s.kind));
  });

  it('fits the stages to a target end date', () => {
    const plan = draftClientPlan(titled('Kickoff', 'Design', 'Build', 'Launch'), {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    assert.equal(plan.stages[0].startDate, '2026-10-01');
    assert.equal(plan.stages[plan.stages.length - 1].dueDate, '2026-10-31');
    assert.ok(plan.stages.every((s) => s.startDate! <= s.dueDate!));
  });

  it('leaves the dates off without a start date, and ignores an end too close to fit', () => {
    const undated = draftClientPlan(titled('Kickoff', 'Build'));
    assert.ok(undated.stages.every((s) => s.startDate === undefined && s.dueDate === undefined));
    assert.deepEqual(spreadStageDates([5, 5], '2026-10-01', '2026-10-01'), [
      { startDate: '2026-10-01', dueDate: '2026-10-05' },
      { startDate: '2026-10-06', dueDate: '2026-10-10' },
    ]);
  });

  it('writes nothing Firestore would refuse', () => {
    const plan = draftClientPlan([], {});
    assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, 'no undefined values');
  });
});

function checklist(sections: { title: string; statuses: ChecklistItemStatus[]; role?: string }[]): ProjectChecklist {
  return {
    id: 'c1',
    projectId: 'p1',
    templateId: 't',
    templateName: 'SOP',
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-20'),
    sections: sections.map((s, order) => ({
      id: `sec${order}`,
      title: s.title,
      order,
      ...(s.role ? { role: s.role } : {}),
      items: s.statuses.map((status, i) => ({ id: `i${order}_${i}`, title: `Step ${i}`, status, order: i })),
    })),
  } as ProjectChecklist;
}

const plan = (): ClientPlan => draftClientPlan(titled('Kickoff', 'Design', 'Build', 'Launch'), { startDate: '2026-10-01' });

describe('where the project is', () => {
  it('follows the checklist: the earliest stage with something left to do', () => {
    const resolved = resolveClientPlan(plan(), [
      checklist([
        { title: 'Kickoff', statuses: ['completed', 'skipped'] },
        { title: 'Design', statuses: ['completed', 'completed', 'in_progress'] },
        { title: 'Build', statuses: ['completed', 'not_started'] },
        { title: 'Launch', statuses: ['not_started'] },
      ]),
    ]);
    assert.equal(resolved.source, 'checklist');
    assert.equal(resolved.currentIndex, 1);
    assert.deepEqual(resolved.stages.map((s) => s.state), ['done', 'current', 'upcoming', 'upcoming']);
    assert.equal(resolved.stages[1].percent, 66);
    assert.deepEqual(resolved.stages[0].tracking, { done: 1, total: 1, open: 0 });
  });

  it('moves past a stage nothing tracks once a later stage has work ticked', () => {
    const p = plan();
    p.stages.splice(1, 0, { id: 'workshop', title: 'Content workshop', deliverables: [], files: [] });
    const sections = [
      { title: 'Kickoff', statuses: ['completed'] as ChecklistItemStatus[] },
      { title: 'Design', statuses: ['not_started'] as ChecklistItemStatus[] },
    ];
    assert.equal(resolveClientPlan(p, [checklist(sections)]).stages[1].state, 'current');
    sections[1].statuses = ['completed', 'not_started'];
    const moved = resolveClientPlan(p, [checklist(sections)]);
    assert.equal(moved.stages[1].state, 'done');
    assert.equal(moved.stages[2].state, 'current');
  });

  it('lets the team pin the stage, or say every stage is done', () => {
    const lists = [checklist([{ title: 'Kickoff', statuses: ['not_started'] }])];
    const pinned = resolveClientPlan(plan(), lists, { currentStageId: 'stg_build' });
    assert.equal(pinned.source, 'team');
    assert.equal(pinned.stages[2].state, 'current');
    const complete = resolveClientPlan(plan(), lists, { currentStageId: PLAN_COMPLETE });
    assert.equal(complete.currentIndex, -1);
    assert.ok(complete.stages.every((s) => s.state === 'done'));
    const unknownPin = resolveClientPlan(plan(), lists, { currentStageId: 'stg_gone' });
    assert.equal(unknownPin.source, 'checklist');
    assert.equal(unknownPin.currentIndex, 0);
  });

  it('shows every stage done once the project is delivered', () => {
    const resolved = resolveClientPlan(plan(), [], { status: 'delivered', currentStageId: 'stg_design' });
    assert.equal(resolved.source, 'delivered');
    assert.ok(resolved.stages.every((s) => s.state === 'done'));
  });

  it('counts sections of a stage the team removed toward the stage before', () => {
    const resolved = resolveClientPlan(plan(), [
      checklist([
        { title: 'Kickoff', statuses: ['completed'] },
        { title: 'Design', statuses: ['completed'] },
        { title: 'Development', statuses: ['completed'] },
        { title: 'QA', statuses: ['not_started'] },
      ]),
    ]);
    // No Review stage in this plan, so QA's step keeps Build open.
    assert.equal(resolved.stages[2].state, 'current');
    assert.deepEqual(resolved.stages[2].tracking, { done: 1, total: 2, open: 1 });
  });

  it('starts at the first stage when nothing tracks the plan', () => {
    const resolved = resolveClientPlan(plan(), []);
    assert.equal(resolved.currentIndex, 0);
    assert.ok(resolved.stages.every((s) => s.tracking === null && s.percent === undefined));
  });
});

describe('keeping a stored plan clean', () => {
  it('only ever publishes http(s) links', () => {
    assert.equal(safeHttpUrl('javascript:alert(1)'), null);
    assert.equal(safeHttpUrl('data:text/html,hi'), null);
    assert.equal(safeHttpUrl('figma.com/file/abc'), 'https://figma.com/file/abc');
    assert.equal(safeHttpUrl('  https://staging.acme.com  '), 'https://staging.acme.com');
    assert.equal(safeHttpUrl('not a link'), null);
  });

  it('trims, drops empty lines and bad files, and never stores undefined', () => {
    const clean = normalizeClientPlan({
      stages: [
        {
          id: 's1',
          title: '  Design ',
          kind: 'design',
          deliverables: ['  Homepage ', '', '   '],
          startDate: '2026-10-01',
          dueDate: 'soon',
          files: [
            { id: 'f1', title: '', url: 'figma.com/file/x' },
            { id: 'f2', title: 'Evil', url: 'javascript:alert(1)' },
          ],
        },
      ],
      files: [{ id: 'f3', title: 'Drive', url: 'https://drive.google.com/x' }],
      templateId: undefined,
    });
    assert.deepEqual(clean, {
      stages: [
        {
          id: 's1',
          title: 'Design',
          kind: 'design',
          deliverables: ['Homepage'],
          startDate: '2026-10-01',
          files: [{ id: 'f1', title: 'figma.com', url: 'https://figma.com/file/x' }],
        },
      ],
      files: [{ id: 'f3', title: 'Drive', url: 'https://drive.google.com/x' }],
    });
  });
});

describe('a portal set up before plans existed', () => {
  const timeline = (): ProjectTimeline => ({
    id: 'p1',
    projectId: 'p1',
    phases: [
      { id: 'design', title: 'Design', order: 1 },
      { id: 'discovery', title: 'Discovery', order: 0 },
      { id: 'internal', title: 'Internal buffer', order: 2 },
    ],
    milestones: [
      { id: 'm1', title: 'Kickoff', phaseId: 'discovery', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-03', order: 0, clientVisible: true },
      { id: 'm2', title: 'Wireframes', phaseId: 'design', status: 'in_progress', startDate: '2026-09-10', endDate: '2026-09-18', order: 1, clientVisible: true },
      { id: 'm3', title: 'Buffer', phaseId: 'internal', status: 'not_started', startDate: '2026-09-20', endDate: '2026-09-25', order: 2 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('keeps what the client could already see, and where it said the project was', () => {
    const legacy = legacyClientPlan({
      timeline: timeline(),
      links: [
        { id: 'l1', title: 'Staging', url: 'https://staging.acme.com', order: 0, source: 'manual', clientVisible: true },
        { id: 'l2', title: 'Internal', url: 'https://notion.so/x', order: 1, source: 'manual' },
      ],
    });
    assert.ok(legacy);
    assert.deepEqual(legacy.plan.stages.map((s) => [s.title, s.deliverables, s.startDate, s.dueDate]), [
      ['Discovery', ['Kickoff'], '2026-09-01', '2026-09-03'],
      ['Design', ['Wireframes'], '2026-09-10', '2026-09-18'],
    ]);
    assert.deepEqual(legacy.plan.files.map((f) => f.title), ['Staging']);
    assert.equal(legacy.currentStageId, 'legacy_design');
  });

  it('honours the phase the team chose, and says done when everything is', () => {
    assert.equal(legacyClientPlan({ timeline: timeline(), currentPhaseId: 'discovery' })?.currentStageId, 'legacy_discovery');
    const done = timeline();
    done.milestones.forEach((m) => (m.status = 'completed'));
    assert.equal(legacyClientPlan({ timeline: done })?.currentStageId, PLAN_COMPLETE);
  });

  it('is nothing at all when nothing was ever switched on', () => {
    const hidden = timeline();
    hidden.milestones.forEach((m) => (m.clientVisible = false));
    assert.equal(legacyClientPlan({ timeline: hidden, links: [] }), null);
  });
});
