import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, nudgesByPerson, skipReasonFor, type NudgeProject } from './delivery.nudge';

function project(overrides: Partial<NudgeProject> = {}): NudgeProject {
  return {
    projectId: 'p1',
    projectName: 'Different AI',
    status: 'current',
    arcComplete: false,
    items: [
      { assignee: 'dev@activeset.co', item: { title: 'Build the homepage', source: 'step', daysOverdue: 2 } },
    ],
    ...overrides,
  };
}

describe('when to stop chasing', () => {
  it('chases a live project with outstanding work', () => {
    assert.equal(skipReasonFor(project()), null);
  });

  it('stops on a closed project', () => {
    assert.equal(skipReasonFor(project({ status: 'closed' })), 'closed');
  });

  it('stops on a paid project', () => {
    assert.equal(skipReasonFor(project({ status: 'paid' })), 'paid');
  });

  it('stops while a project is paused, rather than nagging through a hold', () => {
    assert.equal(skipReasonFor(project({ status: 'paused' })), 'paused');
  });

  it('stops once every stage is finished, whatever the status says', () => {
    // A status somebody forgot to flip should not keep a finished project
    // sending mail every morning.
    assert.equal(skipReasonFor(project({ arcComplete: true })), 'arc-complete');
  });

  it('stops when nothing is assigned and unfinished', () => {
    assert.equal(skipReasonFor(project({ items: [] })), 'nothing-outstanding');
  });

  it('prefers the most definite reason when several apply', () => {
    const done = project({ status: 'closed', arcComplete: true, items: [] });
    assert.equal(skipReasonFor(done), 'closed');
  });
});

describe('one bundle per person', () => {
  const projects: NudgeProject[] = [
    project({
      projectId: 'p1',
      projectName: 'Different AI',
      items: [
        { assignee: 'dev@activeset.co', item: { title: 'Build the homepage', source: 'step', daysOverdue: 5 } },
        { assignee: 'design@activeset.co', item: { title: 'Finish the stylescape', source: 'task', daysOverdue: 1 } },
      ],
    }),
    project({
      projectId: 'p2',
      projectName: 'Peak XV',
      items: [
        { assignee: 'dev@activeset.co', item: { title: 'Connect the domain', source: 'step', daysOverdue: -2 } },
      ],
    }),
  ];

  it('gives each person only their own work', () => {
    const [first] = nudgesByPerson(projects).filter((p) => p.assignee === 'dev@activeset.co');
    const titles = first.projects.flatMap((p) => p.items.map((i) => i.title));
    assert.deepEqual(titles, ['Build the homepage', 'Connect the domain']);
  });

  it('gathers one person’s work across projects into a single bundle', () => {
    const dev = nudgesByPerson(projects).find((p) => p.assignee === 'dev@activeset.co');
    assert.equal(dev?.projects.length, 2);
    assert.equal(dev?.total, 2);
  });

  it('counts only what is actually late as overdue', () => {
    const dev = nudgesByPerson(projects).find((p) => p.assignee === 'dev@activeset.co');
    assert.equal(dev?.overdue, 1);
    assert.equal(dev?.allOnTime, false);
  });

  it('says so when nothing of theirs is late, so the mail need not sound alarmed', () => {
    const ahead = [project({ items: [{ assignee: 'dev@activeset.co', item: { title: 'Later', source: 'step', daysOverdue: -3 } }] })];
    assert.equal(nudgesByPerson(ahead)[0].allOnTime, true);
  });

  it('puts the latest project first for each person', () => {
    const dev = nudgesByPerson(projects).find((p) => p.assignee === 'dev@activeset.co');
    assert.deepEqual(dev?.projects.map((p) => p.projectName), ['Different AI', 'Peak XV']);
  });

  it('puts the person with the most overdue work first', () => {
    assert.equal(nudgesByPerson(projects)[0].assignee, 'dev@activeset.co');
  });

  it('never includes somebody with nothing outstanding', () => {
    // The rule Rehan asked for: chase while their part remains, stop the moment
    // it does not.
    const people = nudgesByPerson(projects).map((p) => p.assignee);
    assert.ok(!people.includes('nobody@activeset.co'));
    assert.equal(people.length, 2);
  });

  it('leaves out everyone on a project that should not be chased', () => {
    const closed = projects.map((p) => ({ ...p, status: 'closed' as const }));
    assert.deepEqual(nudgesByPerson(closed), []);
  });

  it('treats the same person as one whatever case their address is written in', () => {
    const mixed = [
      project({
        items: [
          { assignee: 'Dev@ActiveSet.co', item: { title: 'One', source: 'step' } },
          { assignee: 'dev@activeset.co', item: { title: 'Two', source: 'task' } },
        ],
      }),
    ];
    const people = nudgesByPerson(mixed);
    assert.equal(people.length, 1);
    assert.equal(people[0].total, 2);
  });

  it('ignores an item with no assignee rather than inventing one', () => {
    const orphan = [project({ items: [{ assignee: '  ', item: { title: 'Nobody’s', source: 'step' } }] })];
    assert.deepEqual(nudgesByPerson(orphan), []);
  });
});

describe('the digest', () => {
  const projects: NudgeProject[] = [
    project({ projectId: 'p1', projectName: 'Different AI' }),
    project({ projectId: 'p2', projectName: 'Finished thing', arcComplete: true }),
    project({ projectId: 'p3', projectName: 'On hold', status: 'paused' }),
  ];

  it('separates what is being chased from what is not', () => {
    const digest = buildDigest(projects);
    assert.deepEqual(digest.active.map((p) => p.projectName), ['Different AI']);
    assert.deepEqual(digest.skipped.map((p) => p.projectName), ['Finished thing', 'On hold']);
  });

  it('says why each skipped project was left alone', () => {
    // "No mail today" and "I decided not to chase six projects" look identical
    // otherwise, and only one of them means this is working.
    const digest = buildDigest(projects);
    assert.deepEqual(
      digest.skipped.map((p) => p.reason).sort(),
      ['arc-complete', 'paused'],
    );
  });

  it('totals only the work actually being chased', () => {
    const digest = buildDigest(projects);
    assert.equal(digest.totalItems, 1);
    assert.equal(digest.totalOverdue, 1);
  });

  it('comes back empty and quiet when there is nothing to do', () => {
    const digest = buildDigest([project({ status: 'closed' })]);
    assert.deepEqual(digest.people, []);
    assert.equal(digest.totalItems, 0);
    assert.equal(digest.active.length, 0);
  });
});
