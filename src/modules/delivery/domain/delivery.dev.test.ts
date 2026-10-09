import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_NUDGE_INTERVAL_DAYS,
  resolveDevOwnerEmail,
  shouldSendDevNudge,
} from './delivery.dev';

describe('shouldSendDevNudge', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it('skips when activity was recent', () => {
    const recent = new Date(now.getTime() - (DEV_NUDGE_INTERVAL_DAYS - 1) * 86_400_000).toISOString();
    assert.equal(shouldSendDevNudge(undefined, recent, now), false);
  });

  it('sends when activity is stale and no nudge yet', () => {
    const stale = new Date(now.getTime() - (DEV_NUDGE_INTERVAL_DAYS + 1) * 86_400_000).toISOString();
    assert.equal(shouldSendDevNudge(undefined, stale, now), true);
  });

  it('respects nudge cooldown', () => {
    const stale = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    const recentNudge = new Date(now.getTime() - 86_400_000).toISOString();
    assert.equal(shouldSendDevNudge(recentNudge, stale, now), false);
  });
});

describe('resolveDevOwnerEmail', () => {
  it('prefers pinned dev owner', () => {
    const email = resolveDevOwnerEmail(
      { delivery: { devOwnerEmail: 'dev@activeset.co' }, assigneeEmails: ['other@activeset.co'] },
      [],
      [],
    );
    assert.equal(email, 'dev@activeset.co');
  });
});
