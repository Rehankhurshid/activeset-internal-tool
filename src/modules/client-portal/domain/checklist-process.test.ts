import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistItem, ChecklistSection, Project, ProjectChecklist, SOPTemplate } from '@/types';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import { checklistProcess, followChecklist, stepKey } from './checklist-process';
import { portalStageSources } from './portal-sources';
import { buildClientPortalView } from './client-portal.projection';
import type { TimelineStageSource } from './client-timeline';

let seq = 0;
function item(title: string, extra: Partial<ChecklistItem> = {}): ChecklistItem {
  seq += 1;
  return { id: `item_${seq}`, title, status: 'not_started', order: seq, ...extra };
}

function section(title: string, items: ChecklistItem[], extra: Partial<ChecklistSection> = {}): ChecklistSection {
  seq += 1;
  return { id: `sec_${seq}`, title, items, order: seq, ...extra };
}

function checklist(sections: ChecklistSection[], extra: Partial<ProjectChecklist> = {}): ProjectChecklist {
  return {
    id: 'cl_1',
    projectId: 'proj_1',
    templateId: 'sop_brand',
    templateIds: ['sop_brand'],
    templateName: 'Site Branding',
    sections,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-20'),
    ...extra,
  };
}

const done = (day: string): Partial<ChecklistItem> => ({ status: 'completed', completedAt: `${day}T10:00:00.000Z` });

/** A brand checklist as an SOP labelled for the client produces it. */
function brandChecklist(): ProjectChecklist {
  return checklist([
    section('Start: client setup', [
      item('Schedule the kickoff call', { ...done('2026-09-02'), clientStep: 'Kickoff call', clientWho: 'together' }),
      item('Run the kickoff call and write up what was agreed', { ...done('2026-09-08'), clientStep: 'Kickoff call', clientWho: 'together' }),
      item('Create the shared Slack channel with the client', done('2026-09-03')),
      item('Create the ClickUp task list', { clientHidden: true }),
    ], { clientStage: 'Kickoff', clientStep: 'Slack channel & project setup' }),
    section('Phase 2: Analysis + Moodboard', [
      item('Define the brand archetype', done('2026-09-10')),
      item('Create visual moodboard(s)', done('2026-09-12')),
      item('Present moodboard to client for feedback', {
        status: 'in_progress',
        clientStep: 'Feedback on moodboard',
        clientWho: 'client',
      }),
    ], { clientStage: 'Brand Design', clientStep: 'Moodboarding' }),
    section('Phase 4: Branding & Iterating', [
      item('Develop unique logo concepts', { dueDate: '2026-10-03' }),
      item('Explore logo variations', { dueDate: '2026-10-06' }),
    ], { clientStage: 'Brand Design', clientStep: 'Logo & identity concepts' }),
    section('Outputs', [item('Complete brand book / style guide')], { clientStage: 'Brand Design' }),
  ]);
}

describe('checklistProcess', () => {
  it('turns labelled sections and items into the client’s steps, in order, under their stages', () => {
    const stages = checklistProcess([brandChecklist()]);
    assert.deepEqual(
      stages.map((s) => [s.stage.title, s.steps.map((step) => step.title)]),
      [
        ['Kickoff', ['Kickoff call', 'Slack channel & project setup']],
        ['Brand Design', ['Moodboarding', 'Feedback on moodboard', 'Logo & identity concepts']],
      ],
    );
  });

  it('dates a done step on the day its last item was ticked', () => {
    const [kickoff, brand] = checklistProcess([brandChecklist()]);
    const call = kickoff.steps[0];
    assert.equal(call.state, 'done');
    assert.equal(call.endDate, '2026-09-08');
    assert.equal(call.owner, 'both');
    const moodboarding = brand.steps[0];
    assert.equal(moodboarding.state, 'done');
    assert.equal(moodboarding.endDate, '2026-09-12');
  });

  it('dates a step by the day the team recorded, over the day it was ticked', () => {
    const cl = checklist([
      section('Start: client setup', [
        item('Run the kickoff call and write up what was agreed', {
          ...done('2026-09-24'),
          clientStep: 'Kickoff call',
          fields: [
            { id: 'held_on', label: 'Held on', type: 'date' },
            { id: 'recording', label: 'Recording', type: 'url' },
          ],
          values: { held_on: '2026-09-08', recording: 'https://fathom.video/x' },
        }),
      ], { clientStage: 'Kickoff' }),
    ]);
    const [kickoff] = checklistProcess([cl]);
    assert.equal(kickoff.steps[0].endDate, '2026-09-08');
    assert.ok(!JSON.stringify(kickoff).includes('fathom'), 'only the day leaves the item');
  });

  it('leaves hidden items out of a step, so internal housekeeping cannot hold it open', () => {
    const [kickoff] = checklistProcess([brandChecklist()]);
    const setup = kickoff.steps[1];
    assert.equal(setup.state, 'done');
    assert.equal(setup.endDate, '2026-09-03');
  });

  it('reads a client step in progress as waiting on the client', () => {
    const feedback = checklistProcess([brandChecklist()])[1].steps[1];
    assert.equal(feedback.state, 'current');
    assert.equal(feedback.owner, 'client');
    assert.equal(feedback.waiting, true);
  });

  it('plans an unstarted step for the latest due date among its items', () => {
    const logo = checklistProcess([brandChecklist()])[1].steps[2];
    assert.equal(logo.state, 'upcoming');
    assert.equal(logo.endDate, '2026-10-06');
    assert.equal(logo.waiting, undefined);
  });

  it('keeps unlabelled sections off the client’s page entirely', () => {
    const titles = checklistProcess([brandChecklist()]).flatMap((s) => s.steps.map((step) => step.title));
    assert.ok(!titles.includes('Outputs'));
    assert.ok(!titles.some((t) => /brand book/i.test(t)));
  });

  it('makes one step of two sections with the same label', () => {
    const cl = checklist([
      section('Step 4: CMS Configuration', [item('Create CMS collections', done('2026-09-20'))], {
        clientStage: 'Development',
        clientStep: 'CMS, forms & integrations',
      }),
      section('Step 5: Integrations & Custom Code', [item('Configure Webflow forms')], {
        clientStage: 'Development',
        clientStep: 'CMS, forms & integrations',
      }),
    ]);
    const [dev] = checklistProcess([cl]);
    assert.equal(dev.steps.length, 1);
    assert.equal(dev.steps[0].state, 'current');
  });

  it('drops a step whose items were all skipped: it is not happening', () => {
    const cl = checklist([
      section('Logo', [item('Logo concepts', { status: 'skipped' })], { clientStage: 'Brand Design', clientStep: 'Logo concepts' }),
      section('Book', [item('Brand book')], { clientStage: 'Brand Design', clientStep: 'Brand book & files' }),
    ]);
    assert.deepEqual(checklistProcess([cl])[0].steps.map((s) => s.title), ['Brand book & files']);
  });

  it('is empty for a checklist nobody labelled for the client', () => {
    const cl = checklist([section('Step 1', [item('Do a thing', done('2026-09-02'))])]);
    assert.deepEqual(checklistProcess([cl]), []);
  });

  it('takes the labels from the SOP a checklist was made from, when the checklist has none of its own', () => {
    const template: Pick<SOPTemplate, 'id' | 'service' | 'sections'> = {
      id: 'sop_brand',
      service: 'brand',
      sections: [
        {
          title: 'Phase 2: Analysis + Moodboard',
          order: 0,
          clientStep: 'Moodboarding',
          items: [
            { title: 'Create visual moodboard(s)', status: 'not_started', order: 0 },
            {
              title: 'Present moodboard to client for feedback',
              status: 'not_started',
              order: 1,
              clientStep: 'Feedback on moodboard',
              clientWho: 'client',
            },
          ],
        },
      ],
    };
    const legacy = checklist([
      section('Start: client setup', [
        item('Schedule the kickoff call', done('2026-09-02')),
        item('Run the kickoff call and write up what was agreed', done('2026-09-08')),
        item('Create the ClickUp task list'),
      ]),
      section('Phase 2: Analysis + Moodboard', [
        item('Create visual moodboard(s)', done('2026-09-12')),
        item('Present moodboard to client for feedback', { status: 'in_progress' }),
      ]),
    ]);

    assert.deepEqual(checklistProcess([legacy]), [], 'no labels of its own');
    const stages = checklistProcess([legacy], { templates: [template], agency: [AGENCY_START, AGENCY_CLOSE] });
    assert.deepEqual(
      stages.map((s) => [s.stage.title, s.steps.map((step) => [step.title, step.state])]),
      [
        ['Kickoff', [['Kickoff call', 'done']]],
        ['Brand Design', [['Moodboarding', 'done'], ['Feedback on moodboard', 'current']]],
      ],
    );
    assert.equal(stages[1].steps[1].waiting, true);
  });
});

describe('the agency’s own start and close', () => {
  it('label the kickoff call, the sign-off, and keep the housekeeping internal', () => {
    const steps = checklistProcess([], {}).length;
    assert.equal(steps, 0);
    const cl = checklist([
      { ...AGENCY_START, id: 's1', order: 0, items: AGENCY_START.items.map((i, n) => ({ ...i, id: `a${n}` })) },
      { ...AGENCY_CLOSE, id: 's2', order: 1, items: AGENCY_CLOSE.items.map((i, n) => ({ ...i, id: `b${n}` })) },
    ]);
    const stages = checklistProcess([cl]);
    assert.deepEqual(
      stages.map((s) => [s.stage.title, s.steps.map((step) => step.title)]),
      [
        ['Kickoff', ['Kickoff call', 'Slack channel & project setup']],
        ['Handover', ['Walkthrough videos & handover docs', 'Final sign-off', 'Support after launch']],
      ],
    );
  });
});

describe('stepKey', () => {
  it('treats spelling, ampersands and numbering as the same step', () => {
    assert.equal(stepKey('3. Colours & Typography'), stepKey('colors and typography'));
    assert.equal(stepKey('Feedback on the moodboard!'), stepKey('Feedback on moodboard'));
    assert.notEqual(stepKey('Feedback on moodboard'), stepKey('Feedback on logo'));
  });
});

function sheetSource(steps: TimelineStageSource['steps']): TimelineStageSource {
  return { stage: { id: 'brand-design', title: 'Brand Design', deliverables: [], files: [] }, steps };
}

describe('followChecklist', () => {
  const process = checklistProcess([brandChecklist()]);

  it('moves a sheet step the checklist has finished, dated the day it was ticked', () => {
    const { sources, followed } = followChecklist(
      [sheetSource([{ id: 'm', title: 'Moodboarding', state: 'upcoming', endDate: '2026-09-15' }])],
      process,
    );
    assert.equal(followed, 1);
    assert.equal(sources[0].steps[0].state, 'done');
    assert.equal(sources[0].steps[0].endDate, '2026-09-12');
  });

  it('never pulls a step the sheet marked done backwards', () => {
    const { sources } = followChecklist(
      [sheetSource([{ id: 'l', title: 'Logo & identity concepts', state: 'done', endDate: '2026-09-30' }])],
      process,
    );
    assert.equal(sources[0].steps[0].state, 'done');
    assert.equal(sources[0].steps[0].endDate, '2026-09-30');
  });

  it('marks a client step the checklist has in progress as waiting, and keeps the sheet’s link and note', () => {
    const { sources } = followChecklist(
      [
        sheetSource([
          {
            id: 'f',
            title: 'Feedback on the moodboard',
            state: 'upcoming',
            owner: 'client',
            url: 'https://www.figma.com/board',
            note: 'Two directions to choose from',
          },
        ]),
      ],
      process,
    );
    const step = sources[0].steps[0];
    assert.equal(step.state, 'current');
    assert.equal(step.waiting, true);
    assert.equal(step.url, 'https://www.figma.com/board');
    assert.equal(step.note, 'Two directions to choose from');
  });

  it('lists the sheet steps the checklist has no step for', () => {
    const { unmatched, followed } = followChecklist(
      [sheetSource([{ id: 'x', title: 'Extra round of feedback', state: 'upcoming' }])],
      process,
    );
    assert.equal(followed, 0);
    assert.deepEqual(unmatched, ['Extra round of feedback']);
  });
});

describe('portalStageSources', () => {
  const timeline = {
    phases: [{ id: 'p1', title: 'Design', order: 0 }],
    milestones: [{ id: 'm1', title: 'Homepage', phaseId: 'p1', startDate: '2026-09-01', endDate: '2026-09-05', status: 'not_started' }],
  } as unknown as Parameters<typeof portalStageSources>[0]['timeline'];

  it('prefers a checklist labelled for the client over the Timeline tab', () => {
    const picked = portalStageSources({ checklists: [brandChecklist()], timeline });
    assert.equal(picked.kind, 'checklist');
  });

  it('lets an older checklist drive too, on labels borrowed from its SOP', () => {
    const legacy = checklist([section('Start: client setup', [item('Schedule the kickoff call', done('2026-09-02'))])]);
    const picked = portalStageSources({ checklists: [legacy], agency: [AGENCY_START, AGENCY_CLOSE], timeline });
    assert.equal(picked.kind, 'checklist');
    assert.deepEqual(picked.sources[0].steps.map((s) => s.title), ['Kickoff call']);
  });

  it('keeps the Timeline for a checklist nothing labels', () => {
    const plain = checklist([section('Step 1', [item('Do a thing', done('2026-09-02'))])]);
    assert.equal(portalStageSources({ checklists: [plain], timeline }).kind, 'timeline');
  });

  it('falls through to the plan when nothing else has stages', () => {
    assert.equal(portalStageSources({ checklists: [] }).kind, null);
  });
});

describe('buildClientPortalView with a labelled checklist', () => {
  const project = {
    id: 'proj_1',
    name: 'Northwind brand',
    status: 'current',
    links: [],
    clientPortal: { enabled: true },
    services: ['brand'],
    createdAt: new Date('2026-08-30'),
    updatedAt: new Date('2026-09-01'),
  } as unknown as Project;

  it('shows the checklist’s process, and nothing of the items behind it', () => {
    const view = buildClientPortalView({ project, timeline: null, checklists: [brandChecklist()], now: new Date('2026-09-20') });
    assert.equal(view.planSource, 'checklist');
    assert.deepEqual(view.stages.map((s) => s.title), ['Kickoff', 'Brand Design']);
    assert.equal(view.currentStageIndex, 1);
    const json = JSON.stringify(view);
    for (const internal of ['Define the brand archetype', 'Create the ClickUp task list', 'Present moodboard to client', 'Outputs']) {
      assert.ok(!json.includes(internal), `${internal} must not reach the client`);
    }
    const feedback = view.stages[1].steps?.find((s) => s.title === 'Feedback on moodboard');
    assert.equal(feedback?.waiting, true);
  });
});
