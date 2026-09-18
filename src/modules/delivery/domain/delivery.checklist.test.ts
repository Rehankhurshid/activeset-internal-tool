import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { itemsForStage, sectionsForStage, stageProgress } from './delivery.checklist';
import { SOP_TEMPLATES } from '@/lib/sop-templates';
import type { ChecklistItemStatus, ProjectChecklist } from '@/types';

function item(title: string, status: ChecklistItemStatus, order: number) {
  return { id: `item_${title}`, title, status, order };
}

function checklist(
  id: string,
  sections: { title: string; stage?: 'kickoff' | 'launch'; order: number; items: ReturnType<typeof item>[] }[],
): ProjectChecklist {
  return {
    id,
    projectId: 'p1',
    templateId: 't1',
    templateName: `Template ${id}`,
    sections: sections.map((s) => ({ ...s, id: `sec_${s.title}` })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const sample = [
  checklist('c1', [
    { title: 'Input', stage: 'kickoff', order: 0, items: [item('Crawl', 'completed', 0), item('Assets', 'not_started', 1)] },
    { title: 'Build', order: 1, items: [item('Develop', 'not_started', 0)] },
    { title: 'Launch', stage: 'launch', order: 2, items: [item('Domain', 'not_started', 0)] },
  ]),
];

describe('sectionsForStage', () => {
  it('returns only the sections tagged for that stage', () => {
    assert.deepEqual(sectionsForStage(sample, 'kickoff').map((s) => s.section.title), ['Input']);
    assert.deepEqual(sectionsForStage(sample, 'launch').map((s) => s.section.title), ['Launch']);
  });

  it('carries the checklist id, so a tick knows where to write', () => {
    const [first] = sectionsForStage(sample, 'kickoff');
    assert.equal(first.checklistId, 'c1');
    assert.equal(first.checklistName, 'Template c1');
  });

  it('keeps an untagged section out of every stage', () => {
    // This is what every existing template looks like: nothing tagged, so
    // nothing changes for them until someone tags a section.
    const untagged = [checklist('c2', [{ title: 'Step 3', order: 0, items: [item('Anything', 'not_started', 0)] }])];
    assert.deepEqual(sectionsForStage(untagged, 'kickoff'), []);
    assert.deepEqual(sectionsForStage(untagged, 'launch'), []);
  });

  it('orders sections within a checklist by their own order', () => {
    const many = [
      checklist('c1', [
        { title: 'Second', stage: 'kickoff', order: 5, items: [] },
        { title: 'First', stage: 'kickoff', order: 1, items: [] },
      ]),
    ];
    assert.deepEqual(sectionsForStage(many, 'kickoff').map((s) => s.section.title), ['First', 'Second']);
  });

  it('gathers a stage across several checklists on one project', () => {
    const two = [
      ...sample,
      checklist('c2', [{ title: 'Brand kickoff', stage: 'kickoff', order: 0, items: [item('Questionnaire', 'not_started', 0)] }]),
    ];
    assert.deepEqual(sectionsForStage(two, 'kickoff').map((s) => s.section.title), ['Input', 'Brand kickoff']);
  });
});

describe('stageProgress', () => {
  it('counts completed against everything not skipped', () => {
    const progress = stageProgress(sample, 'kickoff');
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 2);
    assert.deepEqual(progress.outstanding, ['Assets']);
    assert.equal(progress.complete, false);
  });

  it('treats skipped as not applicable rather than done', () => {
    const skipped = [
      checklist('c1', [
        { title: 'Input', stage: 'kickoff', order: 0, items: [item('Crawl', 'completed', 0), item('Video', 'skipped', 1)] },
      ]),
    ];
    const progress = stageProgress(skipped, 'kickoff');
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 1, 'the skipped item leaves the denominator');
    assert.equal(progress.skipped, 1);
    assert.equal(progress.complete, true);
  });

  it('reports an untagged stage as untagged, never as complete', () => {
    // 0 of 0 would read as finished. A project nobody has set up has not
    // finished its kickoff.
    const progress = stageProgress([], 'kickoff');
    assert.equal(progress.untagged, true);
    assert.equal(progress.complete, false);
    assert.equal(progress.total, 0);
  });

  it('is complete only when every item is settled', () => {
    const done = [
      checklist('c1', [{ title: 'Input', stage: 'kickoff', order: 0, items: [item('Crawl', 'completed', 0)] }]),
    ];
    assert.equal(stageProgress(done, 'kickoff').complete, true);
  });
});

describe('itemsForStage', () => {
  it('flattens a stage to its items in order', () => {
    assert.deepEqual(itemsForStage(sample, 'kickoff').map((i) => i.title), ['Crawl', 'Assets']);
  });
});

describe('the shipped Webflow SOP template', () => {
  const webflow = SOP_TEMPLATES.find((t) => t.id === 'webflow_migration_v1');

  it('tags the sections the delivery stages need', () => {
    assert.ok(webflow, 'the Webflow migration template should exist');
    const kickoff = webflow!.sections.filter((s) => s.stage === 'kickoff').map((s) => s.title);
    const launch = webflow!.sections.filter((s) => s.stage === 'launch').map((s) => s.title);
    assert.ok(kickoff.length > 0, 'no kickoff section tagged');
    assert.ok(launch.length > 0, 'no launch section tagged');
    assert.ok(kickoff.some((t) => /Input/i.test(t)));
    assert.ok(kickoff.some((t) => /Kickoff/i.test(t)));
  });

  it('includes the first call and the welcome email, which the team does every time', () => {
    const kickoffItems = webflow!.sections
      .filter((s) => s.stage === 'kickoff')
      .flatMap((s) => s.items.map((i) => i.title.toLowerCase()));
    assert.ok(kickoffItems.some((t) => t.includes('kickoff call')), 'no kickoff call item');
    assert.ok(kickoffItems.some((t) => t.includes('welcome email')), 'no welcome email item');
    assert.ok(kickoffItems.some((t) => t.includes('slack channel')), 'no slack channel item');
  });

  it('only names auto-checks the resolver actually knows', () => {
    const known = new Set([
      'page_title', 'meta_description', 'single_h1', 'image_alt',
      'open_graph', 'links_resolve', 'schema', 'spelling',
    ]);
    for (const template of SOP_TEMPLATES) {
      for (const section of template.sections) {
        for (const i of section.items) {
          if (i.autoCheck) {
            assert.ok(known.has(i.autoCheck), `${template.id}: unknown autoCheck ${i.autoCheck}`);
          }
        }
      }
    }
  });
});
