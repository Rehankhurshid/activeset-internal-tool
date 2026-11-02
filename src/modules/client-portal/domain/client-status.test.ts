import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPortalStale, isUpdateFresh } from './client-status';

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

describe('isUpdateFresh', () => {
  it('is fresh for two whole days, then not', () => {
    assert.equal(isUpdateFresh('2026-10-30T12:00:00', '2026-11-01'), true);
    assert.equal(isUpdateFresh('2026-10-30T12:00:00', '2026-11-02'), false);
  });

  it('is never fresh without a readable date', () => {
    assert.equal(isUpdateFresh(undefined, '2026-11-02'), false);
    assert.equal(isUpdateFresh('not a date', '2026-11-02'), false);
  });
});
