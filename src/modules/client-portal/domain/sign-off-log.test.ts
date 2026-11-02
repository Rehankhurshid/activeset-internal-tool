import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { StageApproval } from '@/types';
import { phaseAfterSignOffs, recordedByTeam, signOffLog, teamSignOff, withSignOff, withoutSignOff } from './sign-off-log';

const portal: StageApproval = { stageKey: 'c1:review', stageTitle: 'Staging review', approvedAt: '2026-10-30T09:00:00.000Z' };

describe('the sign-off log', () => {
  it('records a sign-off given in Slack, on the day it was given', () => {
    const entry = teamSignOff(
      {
        title: ' Homepage design ',
        date: '2026-10-27',
        note: 'Picked the green variant',
        via: 'slack',
        sourceUrl: 'https://activeset.slack.com/archives/C1/p1',
        recordedBy: 'Rehan@ActiveSet.co',
      },
      () => 'abc',
    );
    assert.deepEqual(entry, {
      stageKey: 'team:abc',
      stageTitle: 'Homepage design',
      approvedAt: '2026-10-27T12:00:00.000Z',
      note: 'Picked the green variant',
      via: 'slack',
      sourceUrl: 'https://activeset.slack.com/archives/C1/p1',
      recordedBy: 'rehan@activeset.co',
    });
    assert.equal(recordedByTeam(entry), true);
    assert.equal(recordedByTeam(portal), false);
  });

  it('answers a review stage when the team names one, and refuses bad input', () => {
    const entry = teamSignOff(
      { title: 'Staging review', date: '2026-10-30', stageKey: 'c1:review', via: 'fax', sourceUrl: 'javascript:alert(1)', recordedBy: 'a@activeset.co' },
      () => 'x',
    );
    assert.equal(entry.stageKey, 'c1:review');
    assert.equal(entry.via, undefined);
    assert.equal(entry.sourceUrl, undefined);
    assert.throws(() => teamSignOff({ title: ' ', date: '2026-10-30', recordedBy: 'a' }, () => 'x'));
    assert.throws(() => teamSignOff({ title: 'X', date: '30/10/2026', recordedBy: 'a' }, () => 'x'));
  });

  it('keeps the first record of a stage, and reads oldest first', () => {
    const later = { ...portal, approvedAt: '2026-11-01T09:00:00.000Z', note: 'again' };
    assert.deepEqual(withSignOff([portal], later), [portal]);
    const homepage: StageApproval = { stageKey: 'team:1', stageTitle: 'Homepage', approvedAt: '2026-10-27T12:00:00.000Z' };
    const log = signOffLog([portal, homepage, { stageKey: 'bad' } as StageApproval]);
    assert.deepEqual(log.map((a) => a.stageKey), ['team:1', 'c1:review']);
    assert.deepEqual(withoutSignOff([portal, homepage], 'team:1'), [portal]);
  });

  it('says which phase comes next', () => {
    const stages = [
      { title: 'Design', state: 'done' as const },
      { title: 'Development', state: 'current' as const },
      { title: 'Launch', state: 'upcoming' as const },
    ];
    assert.deepEqual(phaseAfterSignOffs(stages, 1), { now: 'Development', next: 'Launch' });
    assert.deepEqual(phaseAfterSignOffs([{ title: 'Design', state: 'done' }, { title: 'Launch', state: 'upcoming' }]), { next: 'Launch' });
    assert.deepEqual(phaseAfterSignOffs([{ title: 'Design', state: 'done' }]), { done: true });
    assert.deepEqual(phaseAfterSignOffs([]), {});
  });
});
