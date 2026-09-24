import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientPortalView } from './client-portal.projection';
import { CLIENT_PORTAL_VIEW_KEYS } from './client-portal.types';
import type { ClientPlan, Project, ProjectChecklist, ProjectTimeline, Task } from '@/types';

const SECRET = 'SECRET-SENTINEL';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_1',
    name: 'Website Redesign',
    status: 'current',
    tags: ['retainer'],
    userId: `${SECRET}-uid`,
    client: 'PeakXV',
    logoUrl: 'https://cdn.example.com/peakxv.png',
    billingContactEmail: `${SECRET}@client.com`,
    hourlyRate: 999,
    reviewOwnerEmail: 'rehan@activeset.co',
    assigneeEmails: ['salman@activeset.co'],
    publicAuditShareToken: `${SECRET}-share`,
    webflowConfig: { siteId: `${SECRET}-site`, customDomain: 'peakxv.com' } as Project['webflowConfig'],
    clickupListId: `${SECRET}-list`,
    links: [
      { id: 'l1', title: 'Staging', url: 'https://staging.peakxv.com', order: 0, source: 'manual', clientVisible: true },
      { id: 'l2', title: 'Live internal dashboard', url: `https://notion.so/${SECRET}`, order: 1, source: 'manual' },
      { id: 'l3', title: '/pricing', url: 'https://peakxv.com/pricing', order: 2, source: 'auto', clientVisible: true },
    ],
    clientPortal: { enabled: true, welcome: 'Welcome to your project hub.' },
    clientFacing: { status: 'needs_client', statusNote: 'Waiting on copy for the About page.', lastUpdateAt: '2026-09-15T10:00:00.000Z' },
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-15'),
    ...overrides,
  };
}

function timeline(): ProjectTimeline {
  return {
    id: 'proj_1',
    projectId: 'proj_1',
    phases: [
      { id: 'ph_design', title: 'Design', order: 1 },
      { id: 'ph_discovery', title: 'Discovery', order: 0 },
      { id: 'ph_build', title: 'Build', order: 2 },
    ],
    milestones: [
      { id: 'm1', title: 'Kickoff', phaseId: 'ph_discovery', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-03', order: 0, clientVisible: true, notes: `${SECRET}-notes`, assignee: `${SECRET}@activeset.co` },
      { id: 'm2', title: 'Wireframes', phaseId: 'ph_design', status: 'in_progress', startDate: '2026-09-10', endDate: '2026-09-18', order: 1, clientVisible: true },
      { id: 'm3', title: 'Internal QA', phaseId: 'ph_build', status: 'not_started', startDate: '2026-09-20', endDate: '2026-09-25', order: 2 },
      { id: 'm4', title: 'Staging review', phaseId: 'ph_build', status: 'blocked', startDate: '2026-09-26', endDate: '2026-09-28', order: 3, clientVisible: true },
    ],
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-15'),
  };
}

function tasks(): Task[] {
  const base = { projectId: 'proj_1', category: 'content' as const, priority: 'medium' as const, source: 'manual' as const, order: 0, createdAt: new Date(), updatedAt: new Date(), createdBy: 'rehan@activeset.co' };
  return [
    { ...base, id: 't1', title: 'Send final About copy', description: `${SECRET}-desc`, status: 'todo', needsClientInput: true, dueDate: '2026-09-22' },
    { ...base, id: 't2', title: 'Internal refactor', description: `${SECRET}-internal`, status: 'in_progress' },
    { ...base, id: 't3', title: 'Old ask', status: 'done', needsClientInput: true },
  ];
}

const planFixture = (): ClientPlan => ({
  stages: [
    {
      id: 'stg_kickoff',
      title: 'Kickoff',
      kind: 'kickoff',
      deliverables: ['A kickoff call'],
      startDate: '2026-09-01',
      dueDate: '2026-09-05',
      files: [{ id: 'f1', title: 'Kickoff notes', url: 'https://docs.google.com/notes' }],
    },
    {
      id: 'stg_design',
      title: 'Design',
      kind: 'design',
      deliverables: ['Homepage design', 'Inner pages'],
      startDate: '2026-09-06',
      dueDate: '2026-09-19',
      files: [
        { id: 'f2', title: 'Figma', url: 'https://figma.com/file/abc' },
        { id: 'f3', title: 'Sneaky', url: 'javascript:alert(1)' },
      ],
    },
    { id: 'stg_build', title: 'Build', kind: 'build', deliverables: ['Staging site'], startDate: '2026-09-20', dueDate: '2026-10-10', files: [] },
  ],
  files: [{ id: 'f4', title: 'Shared drive', url: 'https://drive.google.com/x' }],
  templateId: `${SECRET}-template`,
  updatedAt: '2026-09-16T09:00:00.000Z',
  updatedBy: `${SECRET}@activeset.co`,
});

function sopChecklist(): ProjectChecklist {
  const items = (prefix: string, statuses: ProjectChecklist['sections'][number]['items'][number]['status'][]) =>
    statuses.map((status, i) => ({ id: `${prefix}${i}`, title: `${SECRET} step ${prefix}${i}`, status, order: i }));
  return {
    id: 'c1',
    projectId: 'proj_1',
    templateId: 't1',
    templateName: `${SECRET} SOP`,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-17T12:00:00.000Z'),
    sections: [
      { id: 's1', title: `Kickoff ${SECRET}`, order: 0, role: 'kickoff', items: items('k', ['completed', 'completed']) },
      { id: 's2', title: `Design ${SECRET}`, order: 1, items: items('d', ['completed', 'not_started', 'not_started', 'skipped']) },
      { id: 's3', title: `Development ${SECRET}`, order: 2, items: items('b', ['not_started']) },
    ],
  } as ProjectChecklist;
}

const withPlan = (overrides: Partial<Project> = {}) => project({ clientPlan: planFixture(), ...overrides });

describe('buildClientPortalView', () => {
  it('emits only allow-listed keys, on the view and on every stage', () => {
    const view = buildClientPortalView({ project: withPlan(), timeline: timeline(), tasks: tasks(), checklists: [sopChecklist()] });
    const allowed = new Set<string>(CLIENT_PORTAL_VIEW_KEYS);
    for (const key of Object.keys(view)) {
      assert.ok(allowed.has(key), `unexpected key on portal view: ${key}`);
    }
    const stageKeys = new Set(['id', 'title', 'state', 'startDate', 'dueDate', 'deliverables', 'files', 'percent']);
    for (const stage of view.stages) {
      for (const key of Object.keys(stage)) assert.ok(stageKeys.has(key), `unexpected key on a stage: ${key}`);
    }
  });

  it('never leaks internal data, even when present on the source objects', () => {
    // "paid" rather than "current": a stage's state is legitimately called current.
    const view = buildClientPortalView({ project: withPlan({ status: 'paid' }), timeline: timeline(), tasks: tasks(), checklists: [sopChecklist()] });
    const json = JSON.stringify(view);
    assert.equal(json.includes(SECRET), false, `portal JSON leaked a sentinel: ${json}`);
    assert.equal(json.includes('retainer'), false, 'internal tags leaked');
    assert.equal(json.includes('"paid"'), false, 'internal project status leaked');
    assert.equal(json.includes('999'), false, 'billing leaked');
    assert.equal(json.includes('"kind"'), false, 'how stages are tracked is ours');
  });

  it('follows the checklist to the stage the project is in, with its progress', () => {
    const view = buildClientPortalView({ project: withPlan({ clientFacing: undefined }), timeline: null, checklists: [sopChecklist()] });
    assert.deepEqual(view.stages.map((s) => s.state), ['done', 'current', 'upcoming']);
    assert.equal(view.currentStageIndex, 1);
    // One of three design steps done (the skipped one does not count).
    assert.equal(view.stages[1].percent, 33);
    assert.equal(view.stages[0].percent, undefined, 'progress only shows on the current stage');
    assert.deepEqual(view.stages[1].deliverables, ['Homepage design', 'Inner pages']);
  });

  it('honours the stage the team pinned, and shows everything done once delivered', () => {
    const pinned = buildClientPortalView({
      project: withPlan({ clientFacing: { currentStageId: 'stg_build' } }),
      timeline: null,
      checklists: [sopChecklist()],
    });
    assert.equal(pinned.currentStageIndex, 2);
    assert.equal(pinned.stages[2].percent, 0);

    const delivered = buildClientPortalView({
      project: withPlan({ clientFacing: { status: 'delivered', currentStageId: 'stg_design' } }),
      timeline: null,
      checklists: [sopChecklist()],
    });
    assert.equal(delivered.currentStageIndex, undefined);
    assert.ok(delivered.stages.every((s) => s.state === 'done'));
  });

  it('publishes plan files and stage files, and only http(s) ones', () => {
    const view = buildClientPortalView({ project: withPlan(), timeline: null });
    assert.deepEqual(view.files, [{ id: 'f4', title: 'Shared drive', url: 'https://drive.google.com/x' }]);
    assert.deepEqual(view.stages[1].files.map((f) => f.id), ['f2']);
    assert.equal(JSON.stringify(view).includes('javascript:'), false);
  });

  it('dates the last update by whatever moved last: the note, the plan or a checklist tick', () => {
    const ticked = buildClientPortalView({ project: withPlan(), timeline: null, checklists: [sopChecklist()] });
    assert.equal(ticked.lastUpdateAt, '2026-09-17T12:00:00.000Z');
    const edited = buildClientPortalView({ project: withPlan(), timeline: null });
    assert.equal(edited.lastUpdateAt, '2026-09-16T09:00:00.000Z');
    const noted = buildClientPortalView({ project: project(), timeline: null });
    assert.equal(noted.lastUpdateAt, '2026-09-15T10:00:00.000Z');
  });

  it('keeps an old portal showing what it showed until the team saves a plan', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline() });
    // Only phases with a client-visible milestone, in phase order; the internal milestone stays hidden.
    assert.deepEqual(view.stages.map((s) => s.title), ['Discovery', 'Design', 'Build']);
    assert.deepEqual(view.stages.map((s) => s.deliverables), [['Kickoff'], ['Wireframes'], ['Staging review']]);
    assert.equal(view.currentStageIndex, 1, 'the first phase with unfinished work');
    assert.deepEqual(view.files.map((f) => f.title), ['Staging']);
    assert.equal(view.websiteUrl, 'https://peakxv.com');

    const chosen = buildClientPortalView({ project: project({ clientFacing: { currentPhaseId: 'ph_build' } }), timeline: timeline() });
    assert.equal(chosen.currentStageIndex, 2);
  });

  it('stops publishing the old link switches once a plan is saved', () => {
    const view = buildClientPortalView({
      project: withPlan({
        webflowConfig: undefined,
        links: [{ id: 'l9', title: 'Live site', url: 'https://peakxv.com', order: 0, source: 'manual', clientVisible: true }],
      }),
      timeline: timeline(),
    });
    assert.equal(view.websiteUrl, undefined);
    assert.deepEqual(view.files.map((f) => f.id), ['f4']);
    assert.deepEqual(view.stages.map((s) => s.title), ['Kickoff', 'Design', 'Build']);
  });

  it('turns open needsClientInput tasks into asks with title and due date only', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline(), tasks: tasks() });
    assert.deepEqual(view.asks, [{ id: 't1', title: 'Send final About copy', dueDate: '2026-09-22' }]);
  });

  it('uses portal wording for the status and falls back safely', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline() });
    assert.equal(view.status, 'needs_client');
    assert.equal(view.statusLabel, 'Waiting on you');
    const bare = buildClientPortalView({ project: project({ clientFacing: undefined, clientPortal: undefined, client: undefined, logoUrl: undefined, links: [] }), timeline: null });
    assert.equal(bare.status, 'on_track');
    assert.equal(bare.brandName, 'Website Redesign');
    assert.equal(bare.brandLogoUrl, undefined);
    assert.deepEqual(bare.stages, []);
    assert.deepEqual(bare.files, []);
    assert.equal(bare.currentStageIndex, undefined);
  });

  it('never derives "Open site" from a link whose visibility switch is off', () => {
    // No Webflow domain, so the fallback branch runs. The only title matching
    // the live/production/website heuristic is switched off, so nothing should
    // be published: a title is not consent.
    const view = buildClientPortalView({
      project: project({ webflowConfig: undefined }),
      timeline: null,
    });
    assert.equal(view.websiteUrl, undefined);
    assert.equal(JSON.stringify(view).includes(SECRET), false);
  });

  it('prefers portal branding overrides over project fields', () => {
    const view = buildClientPortalView({
      project: project({ clientPortal: { enabled: true, brandName: 'Peak XV Partners', brandLogoUrl: 'https://cdn.example.com/brand.png' } }),
      timeline: null,
    });
    assert.equal(view.brandName, 'Peak XV Partners');
    assert.equal(view.brandLogoUrl, 'https://cdn.example.com/brand.png');
    assert.equal(view.websiteUrl, 'https://peakxv.com');
  });
});

describe('the review the client is asked to sign off', () => {
  function checklist(sections: { id: string; title: string; role?: string; order: number }[]) {
    return {
      id: 'c1',
      projectId: 'p1',
      templateId: 't1',
      templateName: 'SOP',
      sections: sections.map((s) => ({ ...s, items: [] })),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never;
  }

  const sections = [
    { id: 'setup', title: 'Start: client setup', role: 'kickoff', order: 0 },
    { id: 'staging', title: 'Step 8: Client Review', role: 'client_review', order: 1 },
    { id: 'close', title: 'Close: handover & sign-off', role: 'client_review', order: 2 },
  ];

  it('is absent when no stage asks for one', () => {
    const view = buildClientPortalView({
      project: project(),
      timeline: null,
      checklists: [checklist([sections[0]])],
    });
    assert.equal(view.review, undefined);
  });

  it('is the first one still waiting on them', () => {
    const view = buildClientPortalView({
      project: project(),
      timeline: null,
      checklists: [checklist(sections)],
    });
    assert.equal(view.review?.title, 'Step 8: Client Review');
    assert.equal(view.review?.stageKey, 'c1:staging');
    assert.equal(view.review?.approvedAt, undefined);
  });

  it('moves on once they have answered the first', () => {
    const withApproval = project();
    withApproval.delivery = {
      approvals: [{ stageKey: 'c1:staging', stageTitle: 'Step 8: Client Review', approvedAt: '2026-09-01T10:00:00.000Z' }],
    };
    const view = buildClientPortalView({ project: withApproval, timeline: null, checklists: [checklist(sections)] });
    assert.equal(view.review?.stageKey, 'c1:close');
  });

  it('keeps the last approval on the page rather than vanishing', () => {
    const withApproval = project();
    withApproval.delivery = {
      approvals: [
        { stageKey: 'c1:staging', stageTitle: 'a', approvedAt: '2026-09-01T10:00:00.000Z' },
        { stageKey: 'c1:close', stageTitle: 'b', approvedAt: '2026-09-09T10:00:00.000Z', note: 'Looks great' },
      ],
    };
    const view = buildClientPortalView({ project: withApproval, timeline: null, checklists: [checklist(sections)] });
    assert.equal(view.review?.stageKey, 'c1:close');
    assert.equal(view.review?.approvedAt, '2026-09-09T10:00:00.000Z');
    assert.equal(view.review?.approvedNote, 'Looks great');
  });

  it('never carries the stage\u2019s own step titles to the client', () => {
    // The steps are ours. What the client needs is one thing to say yes to.
    const withItems = {
      id: 'c1', projectId: 'p1', templateId: 't1', templateName: 'SOP',
      sections: [{
        id: 'close', title: 'Close', role: 'client_review', order: 0,
        items: [{ id: 'i1', title: 'Work through the MarkUp comments', status: 'not_started', order: 0 }],
      }],
      createdAt: new Date(), updatedAt: new Date(),
    } as never;
    const view = buildClientPortalView({ project: project(), timeline: null, checklists: [withItems] });
    assert.ok(!JSON.stringify(view).includes('MarkUp'));
  });
});
