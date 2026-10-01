import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistItem, ChecklistSection, ProjectChecklist } from '@/types';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { developmentWord, managedSheetContent, pageWord } from './project-sheet.content';

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

const project = {
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
    assert.deepEqual(content.pages, [
      { page: 'Home', copy: 'Done', design: 'Done', development: 'In progress', link: 'https://dreamteam-ai.webflow.io/' },
      { page: 'Pricing', copy: 'Done', design: 'Waiting on client', development: 'Not started', link: '' },
    ]);
  });

  it('lists what we need from the client, waiting first, and leaves out the team’s own tasks', () => {
    assert.deepEqual(content.inputs, [
      { item: 'Font files', neededBy: '2026-10-05', status: 'Waiting' },
      { item: 'Product screenshots', neededBy: '', status: 'Received' },
    ]);
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
