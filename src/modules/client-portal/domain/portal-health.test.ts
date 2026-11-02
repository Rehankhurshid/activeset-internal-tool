import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { internalOwners, portalContact } from './portal-contact';
import { portalWarnings, type PortalHealthInput } from './portal-health';

const TODAY = '2026-11-02';
const chosen = { email: 'rehan@activeset.co', source: 'set' as const };

function check(overrides: Partial<PortalHealthInput> = {}, view: Partial<PortalHealthInput['view']> = {}) {
  return portalWarnings({
    view: { status: 'on_track', lastUpdateAt: '2026-11-01T09:00:00', facts: { targetLaunchDate: '2026-11-20' }, ...view },
    enabled: true,
    readsSheet: true,
    contact: chosen,
    today: TODAY,
    ...overrides,
  }).map((w) => w.id);
}

describe('portalWarnings', () => {
  it('says nothing about a fresh page with its facts and a chosen contact', () => {
    assert.deepEqual(check(), []);
  });

  it('warns once the page is more than two days old, or was never updated', () => {
    assert.deepEqual(check({}, { lastUpdateAt: '2026-10-29T09:00:00' }), ['stale']);
    assert.deepEqual(check({}, { lastUpdateAt: '2026-10-31T09:00:00' }), [], 'two days is still fresh');
    assert.deepEqual(check({}, { lastUpdateAt: undefined }), ['never_updated']);
  });

  it('warns when the sheet the page reads has no target launch', () => {
    assert.deepEqual(check({}, { facts: undefined }), ['no_target_launch']);
    assert.deepEqual(check({}, { facts: { targetLaunchText: 'Late November' } }), []);
    assert.deepEqual(check({ readsSheet: false }, { facts: undefined }), [], 'no sheet, no Target launch to fill');
  });

  it('warns when the target launch has passed and the page is not Delivered (Different AI)', () => {
    assert.deepEqual(check({}, { facts: { targetLaunchDate: '2026-10-20' } }), ['launch_passed']);
    assert.deepEqual(check({}, { status: 'delivered', facts: { targetLaunchDate: '2026-10-20' }, lastUpdateAt: '2026-10-01' }), []);
  });

  it('flags a contact nobody chose, and a page with nobody to contact', () => {
    assert.deepEqual(check({ contact: { email: 'salman@activeset.co', source: 'lead' } }), ['contact_fallback']);
    assert.deepEqual(check({ contact: { source: 'none' } }), ['no_contact']);
  });

  it('says nothing while the link is off', () => {
    assert.deepEqual(check({ enabled: false, contact: { source: 'none' } }, { lastUpdateAt: undefined }), []);
  });
});

describe('portalContact', () => {
  it('prefers the chosen contact, then the lead, then the team', () => {
    const base = { reviewOwnerEmail: 'salman@activeset.co', assigneeEmails: ['sanjay@activeset.co'] };
    assert.deepEqual(portalContact({ ...base, clientPortal: { agencyContactEmail: 'rehan@activeset.co' } }), chosen);
    assert.deepEqual(portalContact(base), { email: 'salman@activeset.co', source: 'lead' });
    assert.deepEqual(portalContact({ assigneeEmails: ['sanjay@activeset.co'] }), { email: 'sanjay@activeset.co', source: 'team' });
    assert.deepEqual(portalContact({ clientPortal: { agencyContactEmail: ' ' } }), { source: 'none' });
  });

  it('lists the internal owners lead first, once each', () => {
    assert.deepEqual(
      internalOwners({ reviewOwnerEmail: 'Salman@activeset.co', assigneeEmails: ['salman@activeset.co', 'sanjay@activeset.co'] }),
      ['salman@activeset.co', 'sanjay@activeset.co'],
    );
  });
});
