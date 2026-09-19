import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyImprovements, improvementsFor } from './delivery.feedback';
import type { ChecklistItem, ProjectChecklist, SOPTemplate } from '@/types';

function templateItem(title: string, extra: Partial<SOPTemplate['sections'][0]['items'][0]> = {}) {
  return { title, status: 'not_started' as const, order: 0, ...extra };
}

/** Numbers the items the way a stored template always is. */
function template(sections: SOPTemplate['sections']): SOPTemplate {
  return {
    id: 'tpl',
    name: 'Website Migration to Webflow',
    description: '',
    icon: '📄',
    sections: sections.map((section, order) => ({
      ...section,
      order,
      items: section.items.map((item, i) => ({ ...item, order: i })),
    })),
  };
}

function projectItem(title: string, extra: Partial<ChecklistItem> = {}): ChecklistItem {
  return { id: `item_${title}`, title, status: 'not_started', order: 0, ...extra };
}

function checklist(sections: ProjectChecklist['sections']): ProjectChecklist {
  return {
    id: 'c1',
    projectId: 'p1',
    templateId: 'tpl',
    templateName: 'Website Migration to Webflow',
    sections,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const SOURCE = template([
  {
    title: 'Input',
    order: 0,
    role: 'kickoff',
    items: [templateItem('Get the assets folder'), templateItem('Get the font files')],
  },
]);

describe('what travels back to the template', () => {
  it('offers a how-to somebody wrote on the project', () => {
    const project = checklist([
      {
        id: 's1',
        title: 'Input',
        order: 0,
        role: 'kickoff',
        items: [
          projectItem('Get the assets folder', { howTo: 'Ask for a Drive folder; scrape if they have none.' }),
          projectItem('Get the font files'),
        ],
      },
    ]);
    const found = improvementsFor(project, SOURCE);
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, 'changed');
    assert.equal(found[0].itemTitle, 'Get the assets folder');
    assert.match(found[0].summary, /how-to/);
  });

  it('offers new links, and counts them', () => {
    const project = checklist([
      {
        id: 's1', title: 'Input', order: 0, role: 'kickoff',
        items: [
          projectItem('Get the assets folder', {
            links: [{ label: 'extract.pics', url: 'https://extract.pics/' }],
          }),
        ],
      },
    ]);
    assert.match(improvementsFor(project, SOURCE)[0].summary, /1 more link/);
  });

  it('offers a step that was marked blocking', () => {
    const project = checklist([
      {
        id: 's1', title: 'Input', order: 0, role: 'kickoff',
        items: [projectItem('Get the assets folder', { blocking: true })],
      },
    ]);
    assert.match(improvementsFor(project, SOURCE)[0].summary, /marked blocking/);
  });

  it('offers a role the project set and the template does not have', () => {
    const project = checklist([
      { id: 's1', title: 'Input', order: 0, role: 'client_review', items: [] },
    ]);
    const [found] = improvementsFor(project, SOURCE);
    assert.equal(found.kind, 'role');
    assert.equal(found.after.role, 'client_review');
    assert.equal(found.before?.role, 'kickoff');
  });

  it('offers a whole step somebody added, when it carries guidance', () => {
    const project = checklist([
      {
        id: 's1', title: 'Input', order: 0, role: 'kickoff',
        items: [projectItem('Get the Figma', { howTo: 'Edit access, not view.' })],
      },
    ]);
    const [found] = improvementsFor(project, SOURCE);
    assert.equal(found.kind, 'added');
    assert.equal(found.itemTitle, 'Get the Figma');
  });
});

describe('what stays on the project', () => {
  it('ignores notes, assignees, due dates and statuses', () => {
    // These are facts about this build, not about how the work is done.
    const project = checklist([
      {
        id: 's1', title: 'Input', order: 0, role: 'kickoff',
        items: [
          projectItem('Get the assets folder', {
            notes: 'Arrived a week late.',
            assignee: 'rehan@activeset.co',
            dueDate: '2026-10-01',
            status: 'completed',
          }),
          projectItem('Get the font files'),
        ],
      },
    ]);
    assert.deepEqual(improvementsFor(project, SOURCE), []);
  });

  it('ignores a bare step added with nothing to say', () => {
    const project = checklist([
      { id: 's1', title: 'Input', order: 0, role: 'kickoff', items: [projectItem('Chase the client')] },
    ]);
    assert.deepEqual(improvementsFor(project, SOURCE), []);
  });

  it('does not offer to delete guidance the template already has', () => {
    // Emptying a how-to on one project usually means the step did not apply
    // this time, which is what `skipped` is for.
    const rich = template([
      {
        title: 'Input', order: 0, role: 'kickoff',
        items: [templateItem('Get the assets folder', { howTo: 'Ask for a Drive folder.' })],
      },
    ]);
    const project = checklist([
      { id: 's1', title: 'Input', order: 0, role: 'kickoff', items: [projectItem('Get the assets folder')] },
    ]);
    assert.deepEqual(improvementsFor(project, rich), []);
  });

  it('ignores a section the template does not have at all', () => {
    // Adding a stage to an SOP is a decision, made in the Creator.
    const project = checklist([
      {
        id: 's2', title: 'Step 10: Retainer', order: 1,
        items: [projectItem('Agree the retainer', { howTo: 'Monthly hours and what they cover.' })],
      },
    ]);
    assert.deepEqual(improvementsFor(project, SOURCE), []);
  });

  it('reads a renamed step as an addition rather than rewriting the wrong item', () => {
    const project = checklist([
      {
        id: 's1', title: 'Input', order: 0, role: 'kickoff',
        items: [projectItem('Get the brand assets', { howTo: 'Drive folder.' })],
      },
    ]);
    const [found] = improvementsFor(project, SOURCE);
    assert.equal(found.kind, 'added');
  });

  it('matches regardless of case and surrounding space', () => {
    const project = checklist([
      {
        id: 's1', title: '  input  ', order: 0, role: 'kickoff',
        items: [projectItem('GET THE ASSETS FOLDER', { howTo: 'Drive folder.' })],
      },
    ]);
    assert.equal(improvementsFor(project, SOURCE)[0].kind, 'changed');
  });
});

describe('applying them', () => {
  const project = checklist([
    {
      id: 's1', title: 'Input', order: 0, role: 'client_review',
      items: [
        projectItem('Get the assets folder', {
          howTo: 'Ask for a Drive folder.',
          links: [{ label: 'extract.pics', url: 'https://extract.pics/' }],
          notes: 'Late last time.',
          assignee: 'rehan@activeset.co',
        }),
        projectItem('Get the Figma', { howTo: 'Edit access, not view.' }),
      ],
    },
  ]);

  it('writes the guidance onto the matching template item', () => {
    const found = improvementsFor(project, SOURCE).filter((i) => i.kind === 'changed');
    const next = applyImprovements(SOURCE, found);
    const item = next.sections[0].items.find((i) => i.title === 'Get the assets folder')!;
    assert.equal(item.howTo, 'Ask for a Drive folder.');
    assert.deepEqual(item.links, [{ label: 'extract.pics', url: 'https://extract.pics/' }]);
  });

  it('never carries the project-only fields across', () => {
    const found = improvementsFor(project, SOURCE);
    const next = applyImprovements(SOURCE, found);
    const item = next.sections[0].items.find((i) => i.title === 'Get the assets folder')!;
    assert.equal(item.notes, undefined);
    assert.equal(item.assignee, undefined);
  });

  it('appends an added step and renumbers the section', () => {
    const found = improvementsFor(project, SOURCE);
    const next = applyImprovements(SOURCE, found);
    assert.deepEqual(
      next.sections[0].items.map((i) => i.title),
      ['Get the assets folder', 'Get the font files', 'Get the Figma'],
    );
    assert.deepEqual(next.sections[0].items.map((i) => i.order), [0, 1, 2]);
  });

  it('writes a role and drops the tag that would otherwise win on the next read', () => {
    const legacy = template([
      { title: 'Input', order: 0, stage: 'kickoff', items: [templateItem('Get the assets folder')] },
    ]);
    const found = improvementsFor(project, legacy).filter((i) => i.kind === 'role');
    const next = applyImprovements(legacy, found);
    assert.equal(next.sections[0].role, 'client_review');
    assert.equal(next.sections[0].stage, undefined);
  });

  it('leaves everything it was not asked about exactly as it was', () => {
    const found = improvementsFor(project, SOURCE).filter((i) => i.itemTitle === 'Get the Figma');
    const next = applyImprovements(SOURCE, found);
    assert.deepEqual(
      next.sections[0].items.find((i) => i.title === 'Get the font files'),
      SOURCE.sections[0].items.find((i) => i.title === 'Get the font files'),
    );
  });

  it('changes nothing at all when nothing is chosen', () => {
    assert.equal(applyImprovements(SOURCE, []), SOURCE);
  });

  it('is settled after one round: applying leaves no further improvements', () => {
    // If a second diff still found something, the loop would nag forever.
    const next = applyImprovements(SOURCE, improvementsFor(project, SOURCE));
    assert.deepEqual(improvementsFor(project, next), []);
  });
});
