import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '@/types';
import { askOverdue, clientOwnerName, isoDayOrUndefined, waitingOnClient } from './waiting-on-client';

function task(overrides: Partial<Task>): Task {
  return {
    id: 't',
    projectId: 'p',
    title: 'Ask',
    category: 'other',
    status: 'todo',
    priority: 'medium',
    source: 'manual',
    order: 0,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    createdBy: 'rehan@activeset.co',
    needsClientInput: true,
    ...overrides,
  };
}

describe('waiting on the client', () => {
  it('is overdue once the due date or the follow-up date has passed', () => {
    assert.equal(askOverdue({ followUpDate: '2026-10-31' }, '2026-11-02'), true);
    assert.equal(askOverdue({ followUpDate: '2026-11-06' }, '2026-11-02'), false);
    assert.equal(askOverdue({ dueDate: '2026-11-01', followUpDate: '2026-11-06' }, '2026-11-02'), true);
    assert.equal(askOverdue({ followUpDate: '2026-11-02' }, '2026-11-02'), false, 'the day itself is not late');
    assert.equal(askOverdue({}, '2026-11-02'), false);
  });

  it('lists open asks only, overdue first, then by the next follow-up', () => {
    const rows = waitingOnClient(
      [
        task({ id: 'later', followUpAt: '2026-11-10' }),
        task({
          id: 'php2shell',
          title: 'PHP2Shell reply on siteadmin.peakxv.com',
          askedAt: '2026-10-24',
          followUpAt: '2026-10-31',
          clientOwner: 'PeakXV security',
          assignee: 'rehan@activeset.co',
        }),
        task({ id: 'soon', followUpAt: '2026-11-06' }),
        task({ id: 'done', status: 'done', followUpAt: '2026-10-01' }),
        task({ id: 'not-an-ask', needsClientInput: false, followUpAt: '2026-10-01' }),
      ],
      '2026-11-02',
    );
    assert.deepEqual(rows.map((r) => r.task.id), ['php2shell', 'soon', 'later']);
    assert.equal(rows[0].overdue, true);
    assert.equal(rows[0].askedAt, '2026-10-24');
    assert.equal(rows[0].clientOwner, 'PeakXV security');
    assert.equal(rows[0].owner, 'rehan@activeset.co');
  });

  it('drops dates that are not days and owners that are addresses', () => {
    assert.equal(isoDayOrUndefined('2026-10-31T10:00:00Z'), undefined);
    assert.equal(isoDayOrUndefined('soon'), undefined);
    assert.equal(isoDayOrUndefined(' 2026-10-31 '), '2026-10-31');
    assert.equal(clientOwnerName('cto@peakxv.com'), undefined);
    assert.equal(clientOwnerName('  Priya  '), 'Priya');
  });
});
