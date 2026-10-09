import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistItem, ChecklistSection, Project, ProjectChecklist } from '@/types';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { clientKeyLinks, clientPageWord, developmentWord, managedSheetContent, pageWord, seoToFix, sheetBoards, sheetPlan } from './project-sheet.content';

let seq = 0;
const item = (title: string, extra: Partial<ChecklistItem> = {}): ChecklistItem => ({ id: `i${++seq}`, title, status: 'not_started', order: seq, ...extra });
const section = (title: string, items: ChecklistItem[], extra: Partial<ChecklistSection> = {}): ChecklistSection => ({
  id: `s${++seq}`,
  title,
  items,
  order: seq,
  ...extra,
});
const checklist = (sections: ChecklistSection[]): ProjectChecklist => ({
  id: 'c1',
  projectId: 'p1',
  templateId: 't',
  templateName: 'Web Design + Webflow Build',
  sections,
  createdAt: new Date('2026-09-20'),
  updatedAt: new Date('2026-09-30'),
});

const designAndBuild = checklist([
  section('Start: client setup', [
    item('Run the kickoff call', { status: 'completed', completedAt: '2026-09-22T10:00:00Z', clientStep: 'Kickoff call', clientWho: 'together' }),
  ], { clientStage: 'Kickoff' }),
  section('Art direction', [
    item('Moodboards', { status: 'completed', completedAt: '2026-09-26T10:00:00Z' }),
    item('Present the directions', { status: 'in_progress', clientStep: 'Direction chosen', clientWho: 'client' }),
  ], { clientStage: 'Web Design', clientStep: 'Art direction' }),
  section('Step 8: Pre-Launch', [item('Connect the domain', { dueDate: '2026-10-20' })], { clientStage: 'Launch', clientStep: 'Go live' }),
]);

const project: Pick<Project, 'name' | 'client' | 'services' | 'reviewOwnerEmail' | 'links'> & Partial<Project> = {
  name: 'Website redesign',
  client: 'DreamTeam',
  services: ['development', 'web_design'] as ('development' | 'web_design')[],
  reviewOwnerEmail: 'rehan@activeset.co',
  links: [
    { id: 'l1', title: 'Staging', url: 'https://dreamteam-ai.webflow.io', order: 0 },
    { id: 'l2', title: 'Project Tracker', url: 'https://docs.google.com/spreadsheets/d/x', order: 1 },
    { id: 'l3', title: 'Pricing', url: 'https://dreamteam.co/pricing', order: 2, source: 'auto' as const },
  ],
};

describe('managedSheetContent', () => {
  const content = managedSheetContent({
    project,
    checklists: [designAndBuild],
    agency: [AGENCY_START, AGENCY_CLOSE],
    pages: [
      { title: 'Pricing', path: '/pricing', order: 2, work: { copy: 'completed', design: 'in_review' } },
      { title: 'Home', path: '/', order: 1, work: { copy: 'completed', design: 'completed', dev_desktop: 'completed', dev_mobile: 'in_progress' }, stagingLink: 'https://dreamteam-ai.webflow.io/' },
    ],
    asks: [
      { title: 'Product screenshots', status: 'done', needsClientInput: true, order: 0 },
      { title: 'Font files', status: 'todo', needsClientInput: true, dueDate: '2026-10-05', order: 1 },
      { title: 'Internal: fix nav', status: 'todo', needsClientInput: false, order: 2 },
    ],
  });

  it('names the sheet after the client', () => {
    assert.equal(content.title, 'DreamTeam · Project Sheet');
  });

  it('writes only the stages this project has, each step with who, status and date', () => {
    assert.deepEqual(
      content.process.map((r) => [r.stage, r.step, r.who, r.status, r.date]),
      [
        ['Kickoff', 'Kickoff call', 'Together', 'Done', '2026-09-22'],
        ['Web Design', 'Art direction', 'ActiveSet', 'Done', '2026-09-26'],
        ['Web Design', 'Direction chosen', 'Client', 'Waiting on client', ''],
        ['Launch', 'Go live', 'ActiveSet', 'Not started', '2026-10-20'],
      ],
    );
  });

  it('marks the step the project is on as the client’s page does: in Web Design, not the first open row', () => {
    assert.deepEqual(content.process.filter((r) => r.now).map((r) => r.step), ['Direction chosen']);
  });

  it('fills the Overview from the project and its process', () => {
    assert.deepEqual(content.overview, {
      Client: 'DreamTeam',
      Project: 'Website redesign',
      Services: 'Web Design + Development',
      Kickoff: '2026-09-22',
      'Target launch': '2026-10-20',
      'Project lead': 'rehan@activeset.co',
    });
  });

  it('lists the team’s links, not discovered pages or the old tracker', () => {
    assert.deepEqual(content.links, [{ name: 'Staging', url: 'https://dreamteam-ai.webflow.io' }]);
  });

  it('writes pages in order, with development done only when desktop and mobile are', () => {
    // DreamTeam bought design and development, not copy: their copy is theirs, so Final.
    assert.deepEqual(content.pages, [
      { page: 'Home', copy: 'Final', design: 'Done', development: 'In progress', link: 'https://dreamteam-ai.webflow.io/' },
      { page: 'Pricing', copy: 'Final', design: 'Waiting on client', development: 'Not started', link: '' },
    ]);
  });

  it('lists what we need from the client, waiting first, and leaves out the team’s own tasks', () => {
    assert.deepEqual(content.inputs, [
      { item: 'Font files', neededBy: '2026-10-05', status: 'Waiting' },
      { item: 'Product screenshots', neededBy: '', status: 'Received' },
    ]);
  });
});

describe('a project the client’s page shows from its Timeline', () => {
  // Privado: delivered and run from its Timeline; its checklist was never ticked.
  const untouched = checklist([section('Build', [item('Build the pages')], { clientStage: 'Development', clientStep: 'Pages built' })]);
  const timeline = {
    phases: [{ id: 'd', title: 'Development', order: 0 }],
    milestones: [
      { id: 'm1', title: 'Homepage built', phaseId: 'd', status: 'completed' as const, startDate: '2026-08-01', endDate: '2026-08-10', order: 0 },
      { id: 'm2', title: 'Site launched', phaseId: 'd', status: 'completed' as const, startDate: '2026-08-20', endDate: '2026-08-20', order: 1 },
    ],
  };
  const content = (status?: 'delivered') =>
    managedSheetContent({
      project: { ...project, clientFacing: status ? { status } : undefined },
      checklists: [untouched],
      timeline,
    });

  it('writes the Timeline, as the page does, not the unticked checklist', () => {
    assert.deepEqual(
      content().process.map((r) => [r.stage, r.step, r.status, r.date]),
      [
        ['Development', 'Homepage built', 'Done', '2026-08-10'],
        ['Development', 'Site launched', 'Done', '2026-08-20'],
      ],
    );
  });

  it('marks no step as now once the project is delivered', () => {
    assert.equal(content('delivered').process.some((r) => r.now), false);
  });
});

describe('page words', () => {
  it('uses the Process tab’s words', () => {
    assert.equal(pageWord(undefined), 'Not started');
    assert.equal(pageWord('blocked'), 'In progress');
    assert.equal(pageWord('in_review'), 'Waiting on client');
    assert.equal(pageWord('not_required'), 'Not needed');
    assert.equal(developmentWord('completed', 'not_required'), 'Done');
    assert.equal(developmentWord('not_required', 'not_required'), 'Not needed');
    assert.equal(developmentWord('in_review', 'completed'), 'Waiting on client');
  });
});

describe('the client’s own columns on Pages', () => {
  const pages = [{ title: 'Home', path: '/', order: 0, work: { copy: 'not_started', design: 'in_progress', dev_desktop: 'completed', dev_mobile: 'completed' } }];
  const row = (extra: Partial<typeof project> = {}) =>
    managedSheetContent({ project: { ...project, services: ['development'], ...extra }, checklists: [], pages }).pages[0];

  it('words a service the project did not buy as what the client sends', () => {
    assert.deepEqual(row(), { page: 'Home', copy: 'Waiting on client', design: 'In revision', development: 'Done', link: '' });
  });

  it('follows the team’s setting for a column', () => {
    assert.equal(row({ delivery: { disciplineOwners: { design: 'activeset' } } }).design, 'In progress');
  });

  it('says Final, not Done, for the client’s finished work', () => {
    assert.equal(clientPageWord('completed'), 'Final');
    assert.equal(clientPageWord('in_review'), 'Received');
    assert.equal(clientPageWord(undefined), 'Waiting on client');
  });
});

describe('the deliverables tabs', () => {
  const qa = section('Step 6: QA Checklist', [
    item('\u{1F3C1} Check every page has a title and meta description', { status: 'completed', completedAt: '2026-10-02T09:00:00Z', priority: 'P0', week: '2' }),
    item('Review class naming', { clientHidden: true }),
    item('Test every form', { status: 'in_progress', owner: 'joint', notes: 'Waiting on the CRM' }),
  ]);
  const seo = section('Technical SEO', [item('Crawl the site'), item('Fix redirects', { status: 'skipped' })], { sheetTab: 'SEO & AEO', summary: 'Technical health only.' });
  const build = section('Step 3: Page Development', [item('Build the navbar')]);
  const sop = [{ id: 't', service: 'development' as const, sections: [
    { title: 'Step 6: QA Checklist', items: [], order: 0, onProjectSheet: true },
    { title: 'Technical SEO', order: 1, items: [{ title: 'Crawl the site', status: 'not_started' as const, order: 0, priority: 'P0' as const, week: '1' }] },
  ] }];

  it('bands each tab by section, numbered, with owner, priority, status, week and notes; SOP marks and defaults are borrowed', () => {
    const boards = sheetBoards([checklist([build, qa, seo])], sop, 'DreamTeam');
    assert.deepEqual(boards.map((b) => [b.tab, b.sections.map((s) => s.title)]), [
      ['Checklist', ['QA Checklist']],
      ['SEO & AEO', ['Technical SEO']],
    ]);
    assert.deepEqual(boards[0].sections[0].rows, [
      { deliverable: 'Check every page has a title and meta description', owner: 'ActiveSet', priority: 'P0', status: 'Done', week: '2', notes: '' },
      { deliverable: 'Test every form', owner: 'Joint', priority: '', status: 'In progress', week: '', notes: 'Waiting on the CRM' },
    ]);
    assert.equal(boards[1].sections[0].summary, 'Technical health only.');
    assert.deepEqual(boards[1].sections[0].rows[0], { deliverable: 'Crawl the site', owner: 'ActiveSet', priority: 'P0', status: 'Not started', week: '1', notes: '' });
  });

  it('names the client as the owner of their deliverables', () => {
    const boards = sheetBoards([checklist([section('Access', [item('Grant GA4 access', { owner: 'client' })], { sheetTab: 'Analytics & Tracking' })])], [], 'DreamTeam');
    assert.equal(boards[0].sections[0].rows[0].owner, 'DreamTeam');
  });

  it('rolls each band up for the Overview, leaving out what is not needed', () => {
    const plan = sheetPlan(sheetBoards([checklist([qa, seo])], sop));
    assert.deepEqual(plan, [
      { area: 'QA Checklist', tab: 'Checklist', deliverables: 2, p0: 1, done: 1, progress: 50 },
      { area: 'Technical SEO', tab: 'SEO & AEO', deliverables: 1, p0: 1, done: 0, progress: 0 },
    ]);
  });
});

describe('the SEO tab', () => {
  it('says what to fix in plain words', () => {
    assert.equal(seoToFix({ url: 'https://a.co', title: 'Home', description: 'Short', schemaTypes: [], imagesWithoutAlt: 2, h1Count: 0 }),
      'lengthen the description (70+); add an OG image; set a canonical; add schema; add an H1; alt text on 2 images');
  });

  it('writes each page with lengths, schema and the day it was checked', () => {
    const content = managedSheetContent({
      project,
      checklists: [],
      seo: [{ url: 'https://a.co/', title: 'A good title', description: 'x'.repeat(120), ogImage: 'https://cdn/og.jpg', canonical: 'https://a.co/', schemaTypes: ['Organization', 'WebPage'], imagesWithoutAlt: 0, h1Count: 1, checkedAt: '2026-10-01T00:30:00Z' }],
    });
    assert.deepEqual(content.seo[0], {
      page: 'https://a.co/', title: 'A good title', titleLength: 12, description: 'x'.repeat(120), descriptionLength: 120,
      ogImage: 'https://cdn/og.jpg', canonical: 'https://a.co/', schema: 'Organization, WebPage', imagesWithoutAlt: 0, toFix: 'Nothing', checked: '2026-10-01',
    });
  });
});

describe('key links', () => {
  it('leaves out the team’s own tools', () => {
    const links = [
      { id: 'a', title: 'Sitemap', url: 'https://docs.google.com/spreadsheets/d/1', order: 0 },
      { id: 'b', title: 'ClickUp', url: 'https://app.clickup.com/43227923/v/li/1', order: 1 },
      { id: 'c', title: 'Kickoff', url: 'https://fathom.video/calls/829019006', order: 2 },
      { id: 'd', title: 'Recording', url: 'https://fathom.video/share/abc', order: 3 },
    ];
    assert.deepEqual(clientKeyLinks(links).map((l) => l.name), ['Sitemap', 'Recording']);
  });
});
