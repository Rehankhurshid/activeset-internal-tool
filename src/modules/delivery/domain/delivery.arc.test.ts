import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  arcProgress,
  currentStageKey,
  deliveryArc,
  gateFor,
  itemsWithRole,
  roleOf,
  roleProgress,
  sectionStagesOf,
  stageWithRole,
} from './delivery.arc';
import { SOP_TEMPLATES } from '@/lib/sop-templates';
import { agencyBasicsFor } from './delivery.basics';
import { AUTO_CHECK_IDS } from './delivery.types';
import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSection,
  ProjectChecklist,
  StageRole,
} from '@/types';

function item(
  title: string,
  status: ChecklistItemStatus,
  order: number,
  extra: Partial<ChecklistItem> = {},
): ChecklistItem {
  return { id: `item_${title}`, title, status, order, ...extra };
}

interface SectionSpec {
  title: string;
  order: number;
  items: ReturnType<typeof item>[];
  role?: StageRole;
  stage?: 'kickoff' | 'launch';
}

function checklist(id: string, sections: SectionSpec[]): ProjectChecklist {
  return {
    id,
    projectId: 'p1',
    templateId: 't1',
    templateName: `Template ${id}`,
    sections: sections.map((s) => ({ ...s, id: `sec_${s.title}` })) as ChecklistSection[],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const webflowish = [
  checklist('c1', [
    { title: 'Input', role: 'kickoff', order: 0, items: [item('Assets', 'completed', 0)] },
    { title: 'Step 1: Kickoff', role: 'kickoff', order: 1, items: [item('Call', 'not_started', 0)] },
    { title: 'Step 2: Design prep', order: 2, items: [item('Frames', 'not_started', 0)] },
    { title: 'Step 7: QA', role: 'launch', order: 3, items: [item('Links', 'not_started', 0)] },
  ]),
];

describe('the arc', () => {
  it('makes every section a stage, in the SOP’s own order', () => {
    // The old model rendered four of eleven sections. Everything the team does
    // has to have a place, or it goes back to living in a flat list.
    const titles = deliveryArc(webflowish).map((entry) => entry.title);
    assert.deepEqual(titles, [
      'Input',
      'Step 1: Kickoff',
      'Pages',
      'Step 2: Design prep',
      'Step 7: QA',
    ]);
  });

  it('numbers the stages so a screen can say which one of how many', () => {
    assert.deepEqual(deliveryArc(webflowish).map((e) => e.position), [1, 2, 3, 4, 5]);
  });

  it('puts the page grid after the last kickoff stage when nothing claims it', () => {
    const arc = deliveryArc(webflowish);
    assert.equal(arc[2].kind, 'pages');
  });

  it('puts the grid inside the stage that claims it, with no separate entry', () => {
    const claimed = [
      checklist('c1', [
        { title: 'Input', role: 'kickoff', order: 0, items: [] },
        { title: 'Step 5: Page development', role: 'pages', order: 1, items: [item('Home', 'not_started', 0)] },
      ]),
    ];
    const arc = deliveryArc(claimed);
    assert.deepEqual(arc.map((e) => e.title), ['Input', 'Step 5: Page development']);
    assert.equal(arc.filter((e) => e.kind === 'pages').length, 0);
    assert.equal(stageWithRole(arc, 'pages')?.title, 'Step 5: Page development');
  });

  it('still shows the grid when the SOP has no kickoff stage at all', () => {
    const plain = [
      checklist('c1', [
        { title: 'Phase 1', order: 0, items: [] },
        { title: 'Phase 2', order: 1, items: [] },
      ]),
    ];
    assert.deepEqual(deliveryArc(plain).map((e) => e.title), ['Phase 1', 'Pages', 'Phase 2']);
  });

  it('shows the grid even for a project with no checklist yet', () => {
    assert.deepEqual(deliveryArc([]).map((e) => e.title), ['Pages']);
  });

  it('leaves the grid out for work that has no pages, like a brand project', () => {
    const arc = deliveryArc(webflowish, { includePages: false });
    assert.equal(arc.filter((e) => e.kind === 'pages').length, 0);
    assert.equal(arc.length, 4);
  });

  it('still honours a section that claims the grid, even then', () => {
    // The section asked for it by name, which is a stronger signal than a flag
    // about the project as a whole.
    const claimed = [
      checklist('c1', [{ title: 'Build', role: 'pages', order: 0, items: [] }]),
    ];
    const arc = deliveryArc(claimed, { includePages: false });
    assert.equal(stageWithRole(arc, 'pages')?.title, 'Build');
  });

  it('runs several checklists on one project as one arc', () => {
    const two = [
      ...webflowish,
      checklist('c2', [{ title: 'Brand phase', order: 0, items: [item('Moodboard', 'not_started', 0)] }]),
    ];
    assert.ok(deliveryArc(two).some((e) => e.title === 'Brand phase'));
  });

  it('keys a stage by checklist and section, so two sections can share a title', () => {
    const arc = sectionStagesOf(deliveryArc(webflowish));
    assert.equal(arc[0].key, 'c1:sec_Input');
    assert.equal(new Set(arc.map((s) => s.key)).size, arc.length);
  });
});

describe('roles', () => {
  it('reads the tag projects were given before roles existed', () => {
    assert.equal(roleOf({ id: 's', title: 'x', order: 0, items: [], stage: 'kickoff' }), 'kickoff');
    assert.equal(roleOf({ id: 's', title: 'x', order: 0, items: [], stage: 'launch' }), 'launch');
  });

  it('prefers an explicit role over the old tag', () => {
    const section: ChecklistSection = {
      id: 's', title: 'x', order: 0, items: [], stage: 'kickoff', role: 'client_review',
    };
    assert.equal(roleOf(section), 'client_review');
  });

  it('leaves an untagged section as an ordinary stage', () => {
    assert.equal(roleOf({ id: 's', title: 'x', order: 0, items: [] }), undefined);
  });

  it('gathers the items of every stage sharing a role', () => {
    assert.deepEqual(itemsWithRole(webflowish, 'kickoff').map((i) => i.title), ['Assets', 'Call']);
  });

  it('reports a role nothing plays as untagged, never as complete', () => {
    const progress = roleProgress(webflowish, 'client_review');
    assert.equal(progress.untagged, true);
    assert.equal(progress.complete, false);
  });
});

describe('progress', () => {
  it('counts the whole SOP, not just the two ends of it', () => {
    const progress = arcProgress(webflowish);
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 4);
    assert.deepEqual(progress.outstanding, ['Call', 'Frames', 'Links']);
  });

  it('drops a skipped item out of the denominator rather than counting it done', () => {
    const skipped = [
      checklist('c1', [
        { title: 'Input', order: 0, items: [item('Assets', 'completed', 0), item('Video', 'skipped', 1)] },
      ]),
    ];
    const progress = arcProgress(skipped);
    assert.equal(progress.done, 1);
    assert.equal(progress.total, 1);
    assert.equal(progress.skipped, 1);
    assert.equal(progress.complete, true);
  });

  it('lists outstanding blocking items separately', () => {
    const gated = [
      checklist('c1', [
        {
          title: 'Input',
          order: 0,
          items: [item('Assets', 'not_started', 0, { blocking: true }), item('Nice to have', 'not_started', 1)],
        },
      ]),
    ];
    const stage = sectionStagesOf(deliveryArc(gated))[0];
    assert.deepEqual(stage.progress.blocking, ['Assets']);
    assert.deepEqual(stage.progress.outstanding, ['Assets', 'Nice to have']);
  });
});

describe('overdue', () => {
  const dated = [
    checklist('c1', [
      {
        title: 'Input',
        order: 0,
        items: [
          { ...item('Late', 'not_started', 0), dueDate: '2026-09-01' },
          { ...item('Due later', 'not_started', 1), dueDate: '2026-12-01' },
          { ...item('Late but done', 'completed', 2), dueDate: '2026-09-01' },
          { ...item('Late but skipped', 'skipped', 3), dueDate: '2026-09-01' },
          item('No date', 'not_started', 4),
        ],
      },
    ]),
  ];

  const stage = () => sectionStagesOf(deliveryArc(dated, { today: '2026-09-19' }))[0];

  it('lists only what is late and still open', () => {
    assert.deepEqual(stage().progress.overdue, ['Late']);
  });

  it('never calls a settled item overdue, whatever its date says', () => {
    // The date has done its job once somebody has answered.
    const titles = stage().progress.overdue;
    assert.ok(!titles.includes('Late but done'));
    assert.ok(!titles.includes('Late but skipped'));
  });

  it('reads a full timestamp as the day it names', () => {
    const withTime = [
      checklist('c1', [
        {
          title: 'Input', order: 0,
          items: [{ ...item('Late', 'not_started', 0), dueDate: '2026-09-18T23:30:00.000Z' }],
        },
      ]),
    ];
    assert.deepEqual(
      sectionStagesOf(deliveryArc(withTime, { today: '2026-09-19' }))[0].progress.overdue,
      ['Late'],
    );
  });

  it('does not call something due today late', () => {
    const today = [
      checklist('c1', [
        { title: 'Input', order: 0, items: [{ ...item('Now', 'not_started', 0), dueDate: '2026-09-19' }] },
      ]),
    ];
    assert.deepEqual(
      sectionStagesOf(deliveryArc(today, { today: '2026-09-19' }))[0].progress.overdue,
      [],
    );
  });
});

describe('the gate', () => {
  const gated = [
    checklist('c1', [
      { title: 'Input', order: 0, items: [item('Assets', 'not_started', 0, { blocking: true })] },
      { title: 'Build', order: 1, items: [item('Home', 'not_started', 0)] },
    ]),
  ];

  it('always leaves the first stage open', () => {
    const arc = deliveryArc(gated);
    assert.equal(gateFor(arc, arc[0].key).open, true);
  });

  it('closes a later stage while something before it blocks, and says what', () => {
    const arc = deliveryArc(gated);
    const build = arc.find((e) => e.title === 'Build')!;
    assert.deepEqual(gateFor(arc, build.key), { open: false, waitingOn: ['Assets'] });
  });

  it('opens once the blocking item is settled', () => {
    const settled = [
      checklist('c1', [
        { title: 'Input', order: 0, items: [item('Assets', 'completed', 0, { blocking: true })] },
        { title: 'Build', order: 1, items: [item('Home', 'not_started', 0)] },
      ]),
    ];
    const arc = deliveryArc(settled);
    const build = arc.find((e) => e.title === 'Build')!;
    assert.equal(gateFor(arc, build.key).open, true);
  });

  it('gates nothing when nobody has marked anything blocking', () => {
    // The gate is opt-in, one item at a time. A team that never uses it sees
    // the arc behave exactly as it did before.
    const arc = deliveryArc(webflowish);
    for (const entry of arc) assert.equal(gateFor(arc, entry.key).open, true);
  });

  it('treats a skipped blocking item as settled', () => {
    const skipped = [
      checklist('c1', [
        { title: 'Input', order: 0, items: [item('Assets', 'skipped', 0, { blocking: true })] },
        { title: 'Build', order: 1, items: [] },
      ]),
    ];
    const arc = deliveryArc(skipped);
    assert.equal(gateFor(arc, arc[arc.length - 1].key).open, true);
  });
});

describe('where to land someone', () => {
  it('opens the earliest unfinished stage, not the furthest along', () => {
    const arc = deliveryArc(webflowish);
    assert.equal(currentStageKey(arc), 'c1:sec_Step 1: Kickoff');
  });

  it('falls back to the first stage when everything is done', () => {
    const done = [checklist('c1', [{ title: 'Input', order: 0, items: [item('Assets', 'completed', 0)] }])];
    const arc = deliveryArc(done);
    assert.equal(currentStageKey(arc), arc[0].key);
  });
});

describe('the shipped Webflow SOP', () => {
  const webflow = SOP_TEMPLATES.find((t) => t.id === 'webflow_migration_v1')!;
  const roles = webflow.sections.map((s) => s.role);

  it('marks where the build happens and where launch is decided', () => {
    assert.ok(roles.includes('kickoff'), 'no kickoff stage');
    assert.ok(roles.includes('pages'), 'nothing says where the pages get built');
    assert.ok(roles.includes('launch'), 'no launch stage');
    assert.ok(roles.includes('client_review'), 'no client review stage');
  });

  it('puts the page grid in the page development step, not in a stage of its own', () => {
    const pages = webflow.sections.find((s) => s.role === 'pages');
    assert.match(pages!.title, /Page Development/);
  });

  it('still says what is specific to a website build', () => {
    // The agency-wide steps moved out; what is left has to be the Webflow part.
    const titles = webflow.sections.flatMap((s) => s.items.map((i) => i.title.toLowerCase()));
    assert.ok(titles.some((t) => t.includes('screaming frog') || t.includes('scan the live site')));
    assert.ok(titles.some((t) => t.includes('webflow')));
    assert.ok(titles.some((t) => t.includes('redirect')));
  });

  it('names only scan signals the resolver implements', () => {
    const known = new Set(AUTO_CHECK_IDS);
    for (const template of SOP_TEMPLATES) {
      for (const section of template.sections) {
        for (const i of section.items) {
          if (i.autoCheck) assert.ok(known.has(i.autoCheck), `${template.id}: unknown ${i.autoCheck}`);
        }
      }
    }
  });

  it('has no URL left inside an item title, where it would not be clickable', () => {
    // This is why `links` exists: authors had nowhere else to put them.
    for (const template of SOP_TEMPLATES) {
      for (const section of template.sections) {
        for (const i of section.items) {
          assert.ok(!/https?:\/\//.test(i.title), `${template.id}: URL in title — ${i.title}`);
        }
      }
    }
  });

  it('gates the few things that genuinely stop the next stage', () => {
    const blocking = webflow.sections.flatMap((s) => s.items.filter((i) => i.blocking).map((i) => i.title));
    assert.ok(blocking.length > 0, 'nothing is marked blocking');
    assert.ok(blocking.length < 12, 'a gate on everything is a gate on nothing');
    assert.ok(blocking.some((t) => /redirect/i.test(t)), 'redirects should block a launch');
  });
});

describe('the agency basics, which every project gets', () => {
  // Getting the client into Slack, the welcome email and the walkthrough are not
  // Webflow facts. They are applied when a checklist is created rather than
  // baked into a template, because almost every real project runs from a
  // template somebody wrote themselves — wrapping only the built-ins reached
  // nothing.
  const COMMON = [
    'kickoff call',
    'slack channel',
    'welcome email',
    'sync cadence',
    'clickup task list',
    'project tracker',
    'internal kickoff',
    'walkthrough videos',
    'written approval',
  ];

  for (const template of SOP_TEMPLATES) {
    it(`reach a checklist made from "${template.name}"`, () => {
      const sections = agencyBasicsFor(
        template.sections.map((s, order) => ({
          id: `sec_${order}`,
          title: s.title,
          order,
          role: s.role,
          items: s.items.map((i, n) => item(i.title, i.status, n)),
        })),
      );
      const titles = sections.flatMap((s) => s.items.map((i) => i.title.toLowerCase()));
      for (const needle of COMMON) {
        assert.ok(titles.some((t) => t.includes(needle)), `${template.id} is missing "${needle}"`);
      }
    });
  }

  it('reach a checklist made from a template nobody shipped', () => {
    // The whole point: a custom template gets them too.
    const custom = agencyBasicsFor([
      { id: 's1', title: 'My own stage', order: 0, items: [item('Do the thing', 'not_started', 0)] },
    ]);
    const titles = custom.flatMap((s) => s.items.map((i) => i.title.toLowerCase()));
    for (const needle of COMMON) {
      assert.ok(titles.some((t) => t.includes(needle)), `a custom template is missing "${needle}"`);
    }
  });

  it('open the arc with client setup and close it with sign-off', () => {
    const sections = agencyBasicsFor([
      { id: 's1', title: 'My own stage', order: 0, items: [] },
    ]);
    const arc = deliveryArc([checklist('c1', sections.map((s) => ({
      title: s.title, order: s.order, role: s.role, items: [],
    })))]);
    assert.match(arc[0].title, /client setup/i);
    assert.equal(arc[0].role, 'kickoff');
    assert.match(arc[arc.length - 1].title, /sign-off/i);
    assert.equal(arc[arc.length - 1].role, 'client_review');
  });

  for (const template of SOP_TEMPLATES) {
    it(`numbers "${template.name}" without gaps or repeats`, () => {
      assert.deepEqual(
        template.sections.map((s) => s.order),
        template.sections.map((_, i) => i),
      );
    });

    it(`says each step of "${template.name}" only once`, () => {
      const titles = template.sections.flatMap((s) => s.items.map((i) => i.title.toLowerCase().trim()));
      const seen = new Set<string>();
      for (const title of titles) {
        assert.ok(!seen.has(title), `${template.id} lists "${title}" twice`);
        seen.add(title);
      }
    });
  }
});

describe('the shipped SOP templates', () => {
  it('give every section of every template a place in the arc', () => {
    for (const template of SOP_TEMPLATES) {
      const asChecklist = checklist(template.id, template.sections.map((section, order) => ({
        title: section.title,
        order,
        stage: section.stage,
        role: section.role,
        items: section.items.map((i, n) => item(i.title, i.status, n)),
      })));
      const arc = deliveryArc([asChecklist]);
      const rendered = new Set(arc.map((e) => e.title));
      for (const section of template.sections) {
        assert.ok(rendered.has(section.title), `${template.id}: ${section.title} has nowhere to live`);
      }
    }
  });
});
