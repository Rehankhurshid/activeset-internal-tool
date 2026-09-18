import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientPortalView } from './client-portal.projection';
import { CLIENT_PORTAL_VIEW_KEYS } from './client-portal.types';
import type { Project, ProjectTimeline, Task } from '@/types';

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

describe('buildClientPortalView', () => {
  it('emits only allow-listed keys', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline(), tasks: tasks() });
    const allowed = new Set<string>(CLIENT_PORTAL_VIEW_KEYS);
    for (const key of Object.keys(view)) {
      assert.ok(allowed.has(key), `unexpected key on portal view: ${key}`);
    }
  });

  it('never leaks internal data, even when present on the source objects', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline(), tasks: tasks() });
    const json = JSON.stringify(view);
    assert.equal(json.includes(SECRET), false, `portal JSON leaked a sentinel: ${json}`);
    assert.equal(json.includes('retainer'), false, 'internal tags leaked');
    assert.equal(json.includes('"current"'), false, 'internal project status leaked');
    assert.equal(json.includes('999'), false, 'billing leaked');
  });

  it('includes only client-visible manual links as deliverables', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline() });
    assert.deepEqual(view.deliverables.map((d) => d.id), ['l1']);
  });

  it('includes only client-visible milestones, sorted phases, softened statuses', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline() });
    assert.deepEqual(view.phases.map((p) => p.title), ['Discovery', 'Design', 'Build']);
    assert.deepEqual(view.phases.flatMap((p) => p.milestones.map((m) => m.id)), ['m1', 'm2', 'm4']);
    assert.equal(view.phases[2].milestones[0].status, 'on_hold');
    assert.deepEqual(view.progress, { done: 1, total: 3 });
    assert.equal(view.nextMilestone?.id, 'm2');
  });

  it('derives the current phase when the team has not chosen one, and honours the choice when it has', () => {
    const derived = buildClientPortalView({ project: project(), timeline: timeline() });
    assert.equal(derived.currentPhase?.title, 'Design');
    assert.equal(derived.currentPhase?.index, 1);
    assert.equal(derived.currentPhase?.total, 3);
    const chosen = buildClientPortalView({
      project: project({ clientFacing: { currentPhaseId: 'ph_build' } }),
      timeline: timeline(),
    });
    assert.equal(chosen.currentPhase?.title, 'Build');
    assert.equal(chosen.phases.filter((p) => p.isCurrent).length, 1);
  });

  it('turns open needsClientInput tasks into asks with title and due date only', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline(), tasks: tasks() });
    assert.deepEqual(view.asks, [{ id: 't1', title: 'Send final About copy', dueDate: '2026-09-22' }]);
  });

  it('uses portal wording for the status and falls back safely', () => {
    const view = buildClientPortalView({ project: project(), timeline: timeline() });
    assert.equal(view.status, 'needs_client');
    assert.equal(view.statusLabel, 'Waiting on you');
    const bare = buildClientPortalView({ project: project({ clientFacing: undefined, clientPortal: undefined, client: undefined, logoUrl: undefined }), timeline: null });
    assert.equal(bare.status, 'on_track');
    assert.equal(bare.brandName, 'Website Redesign');
    assert.equal(bare.brandLogoUrl, undefined);
    assert.deepEqual(bare.phases, []);
    assert.deepEqual(bare.progress, { done: 0, total: 0 });
  });

  it('keeps visible milestones without a phase (or with a deleted phase) in an Other group', () => {
    const t = timeline();
    t.milestones.push(
      { id: 'm5', title: 'Content handover', status: 'not_started', startDate: '2026-09-05', endDate: '2026-09-06', order: 4, clientVisible: true },
      { id: 'm6', title: 'Orphaned', phaseId: 'ph_deleted', status: 'in_progress', startDate: '2026-09-04', endDate: '2026-09-07', order: 5, clientVisible: true },
    );
    const view = buildClientPortalView({ project: project({ clientFacing: undefined }), timeline: t });
    const other = view.phases[view.phases.length - 1];
    assert.equal(other.ungrouped, true);
    assert.equal(other.title, 'Other');
    assert.deepEqual(other.milestones.map((m) => m.id), ['m6', 'm5']);
    assert.deepEqual(view.progress, { done: 1, total: 5 });
    assert.equal(view.nextMilestone?.id, 'm6');
    assert.equal(view.currentPhase?.total, 3, 'the Other group is not a phase');
    assert.equal(view.phases.filter((p) => p.isCurrent).length, 1);
    assert.equal(view.phases.find((p) => p.isCurrent)?.title, 'Design');
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

    const opted = buildClientPortalView({
      project: project({
        webflowConfig: undefined,
        links: [
          { id: 'l9', title: 'Live site', url: 'https://peakxv.com', order: 0, source: 'manual', clientVisible: true },
        ],
      }),
      timeline: null,
    });
    assert.equal(opted.websiteUrl, 'https://peakxv.com');
  });

  it('keeps phases with nothing visible off the stepper and out of the phase count', () => {
    const t = timeline();
    t.phases.push({ id: 'ph_internal', title: 'Internal QA & buffer', order: 3 });
    t.milestones.push({
      id: 'm9',
      title: 'Internal buffer',
      phaseId: 'ph_internal',
      status: 'not_started',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      order: 9,
    });
    const view = buildClientPortalView({ project: project({ clientFacing: undefined }), timeline: t });
    assert.equal(
      view.phases.some((p) => p.title === 'Internal QA & buffer'),
      false,
      'a phase with no client-visible milestone must not be named to the client',
    );
    // Discovery, Design and Build each keep a visible milestone; the empty one goes.
    assert.deepEqual(view.phases.map((p) => p.title), ['Discovery', 'Design', 'Build']);
    assert.equal(view.currentPhase?.total, 3);
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
