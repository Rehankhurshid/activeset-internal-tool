import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  meetingDomainsFor,
  normalizeClientTimelineSettings,
  normalizeMeetingDomain,
  resolveTimelinePlan,
  stageForDate,
  timelineStages,
} from './client-timeline';
import type { ProjectTimeline } from '@/types';

const timeline = (): Pick<ProjectTimeline, 'phases' | 'milestones'> => ({
  phases: [
    { id: 'b', title: 'Build', order: 1 },
    { id: 'a', title: 'Design', order: 0 },
    { id: 'c', title: 'Empty', order: 2 },
  ],
  milestones: [
    { id: 'm2', title: 'Inner pages', phaseId: 'a', status: 'not_started', startDate: '2026-09-08', endDate: '2026-09-12', order: 1 },
    { id: 'm1', title: 'Homepage', phaseId: 'a', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-05', order: 0 },
    { id: 'm3', title: 'Staging', phaseId: 'b', status: 'blocked', startDate: '2026-09-15', endDate: '2026-09-20', order: 2 },
    { id: 'm4', title: 'Stray', status: 'not_started', startDate: '2026-09-25', endDate: '2026-09-25', order: 3 },
  ],
});

describe('timelineStages', () => {
  it('orders phases, sorts milestones by date, spans dates and drops empty phases', () => {
    const stages = timelineStages(timeline(), undefined);
    assert.deepEqual(stages.map((s) => s.stage.title), ['Design', 'Build', 'Other milestones']);
    assert.deepEqual(stages[0].steps.map((s) => s.title), ['Homepage', 'Inner pages']);
    assert.deepEqual([stages[0].stage.startDate, stages[0].stage.dueDate], ['2026-09-01', '2026-09-12']);
    assert.equal(stages[1].steps[0].state, 'current', 'blocked reads as in progress');
  });

  it('leaves out hidden milestones', () => {
    const stages = timelineStages(timeline(), { hiddenMilestoneIds: ['m3', 'm4'] });
    assert.deepEqual(stages.map((s) => s.stage.title), ['Design']);
  });
});

describe('resolveTimelinePlan', () => {
  it('puts the project in the furthest phase where work has started', () => {
    const resolved = resolveTimelinePlan(timelineStages(timeline(), undefined));
    // Build's staging is under way, so the project is in Build although Design has an inner page left.
    assert.equal(resolved.currentIndex, 1);
    assert.equal(resolved.stages[0].state, 'done');
    assert.deepEqual(resolved.stages[0].tracking, { done: 1, total: 2, open: 1 });
  });

  it('moves to the next phase once the furthest started one is finished, and starts at the first', () => {
    const step = (id: string, state: 'done' | 'current' | 'upcoming') => ({ id, title: id, state });
    const stage = (id: string) => ({ id, title: id, deliverables: [], files: [] });
    const finished = [
      { stage: stage('a'), steps: [step('a1', 'done'), step('a2', 'upcoming')] },
      { stage: stage('b'), steps: [step('b1', 'done')] },
      { stage: stage('c'), steps: [step('c1', 'upcoming')] },
    ];
    assert.equal(resolveTimelinePlan(finished).currentIndex, 2);
    const fresh = [
      { stage: stage('a'), steps: [step('a1', 'upcoming')] },
      { stage: stage('b'), steps: [step('b1', 'upcoming')] },
    ];
    assert.equal(resolveTimelinePlan(fresh).currentIndex, 0);
    const clientEarly = [
      { stage: stage('a'), steps: [step('a1', 'done'), step('a2', 'upcoming')] },
      { stage: stage('b'), steps: [{ ...step('b1', 'current'), owner: 'client' as const, waiting: true }, step('b2', 'upcoming')] },
    ];
    assert.equal(resolveTimelinePlan(clientEarly).currentIndex, 0, 'a client sending assets early does not start the stage');
    const leftovers = [
      { stage: stage('a'), steps: [step('a1', 'upcoming')] },
      { stage: stage('b'), steps: [step('b1', 'done')] },
    ];
    assert.equal(resolveTimelinePlan(leftovers).currentIndex, 0);
  });

  it('honours a pin, the complete marker and Delivered', () => {
    const sources = timelineStages(timeline(), undefined);
    assert.equal(resolveTimelinePlan(sources, { currentStageId: 'b' }).currentIndex, 1);
    assert.equal(resolveTimelinePlan(sources, { currentStageId: '__complete__' }).currentIndex, -1);
    assert.equal(resolveTimelinePlan(sources, { status: 'delivered' }).currentIndex, -1);
    assert.equal(resolveTimelinePlan(sources, { currentStageId: 'not-a-phase' }).currentIndex, 1, 'an unknown pin follows the steps');
  });
});

describe('stageForDate', () => {
  const stages = [
    { id: 'a', startDate: '2026-09-01', dueDate: '2026-09-12' },
    { id: 'b', startDate: '2026-09-15', dueDate: '2026-09-20' },
  ];
  it('uses the stage a date falls in, else the last one started, else the first', () => {
    assert.equal(stageForDate(stages, '2026-09-16T10:00:00Z'), 'b');
    assert.equal(stageForDate(stages, '2026-09-13T10:00:00Z'), 'a', 'between stages: the one that had started');
    assert.equal(stageForDate(stages, '2026-08-20T10:00:00Z'), 'a', 'before everything: the first');
    assert.equal(stageForDate(stages, '2026-12-01T10:00:00Z'), 'b');
    assert.equal(stageForDate([], '2026-09-16'), undefined);
  });
});

describe('meeting domains', () => {
  it('normalises addresses, URLs and bare domains, and refuses mailbox and platform hosts', () => {
    assert.equal(normalizeMeetingDomain('Preetha.S@AssetPlus.io'), 'assetplus.io');
    assert.equal(normalizeMeetingDomain('https://www.assetplus.io/about'), 'assetplus.io');
    assert.equal(normalizeMeetingDomain('gmail.com'), null);
    assert.equal(normalizeMeetingDomain('rehan@activeset.co'), null);
    assert.equal(normalizeMeetingDomain('privado-ai.webflow.io/'), null);
    assert.equal(normalizeMeetingDomain('not a domain'), null);
  });

  it('uses the team’s domains, else the contacts’ and the site’s', () => {
    const derived = meetingDomainsFor({
      clientPortal: { contactEmails: ['anurag@dreamteam.co', 'someone@gmail.com'] },
      webflowConfig: { siteId: 's', customDomain: 'www.dreamteam.co' },
    } as never);
    assert.deepEqual(derived, ['dreamteam.co']);
    const chosen = meetingDomainsFor({
      clientTimeline: { meetingDomains: ['dreamteam.bot'] },
      clientPortal: { contactEmails: ['anurag@dreamteam.co'] },
    } as never);
    assert.deepEqual(chosen, ['dreamteam.bot']);
  });
});

describe('normalizeClientTimelineSettings', () => {
  it('keeps web links only and drops empty lists', () => {
    const out = normalizeClientTimelineSettings({
      phaseFiles: { a: [{ id: 'f', title: 'Bad', url: 'javascript:alert(1)' }], b: [{ id: 'g', title: 'Figma', url: 'figma.com/x' }] },
      hiddenMilestoneIds: ['m1', 'm1', ''],
      meetingDomains: ['gmail.com', 'AssetPlus.io'],
      files: [],
    });
    assert.deepEqual(out, {
      phaseFiles: { b: [{ id: 'g', title: 'Figma', url: 'https://figma.com/x' }] },
      hiddenMilestoneIds: ['m1'],
      meetingDomains: ['assetplus.io'],
    });
  });
});
