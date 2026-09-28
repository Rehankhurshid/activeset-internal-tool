import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPortalStale } from './client-status';

describe('isPortalStale', () => {
  const old = { lastUpdateAt: '2026-09-01T10:00:00.000Z' };

  it('flags an enabled portal nobody has updated for over a week', () => {
    assert.equal(isPortalStale({ clientPortal: { enabled: true }, clientFacing: old }, '2026-09-28'), true);
    assert.equal(isPortalStale({ clientPortal: { enabled: true } }, '2026-09-28'), true, 'never updated');
  });

  it('never flags a delivered project, or a portal that is off', () => {
    assert.equal(
      isPortalStale({ clientPortal: { enabled: true }, clientFacing: { ...old, status: 'delivered' } }, '2026-09-28'),
      false,
    );
    assert.equal(isPortalStale({ clientPortal: { enabled: false }, clientFacing: old }, '2026-09-28'), false);
  });
});
