import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTAL_CONTENT_SYNC_KEYS,
  cleanContentSyncInput,
  contentSyncTone,
  fromWhalesync,
  isContentSyncStale,
  parseWhalesyncId,
  portalContentSyncs,
  type ContentSync,
} from './content-syncs';
import { buildClientPortalView } from './client-portal.projection';
import { CLIENT_PORTAL_VIEW_KEYS } from './client-portal.types';
import type { Project } from '@/types';

const SECRET = 'SECRET-SENTINEL';
const NOW = new Date('2026-11-02T12:00:00Z');

const row = (overrides: Partial<ContentSync> = {}): ContentSync => ({
  id: 'a',
  name: 'Portfolio companies',
  provider: 'Whalesync',
  source: 'Airtable · Portfolio',
  destination: 'Webflow · Companies',
  state: 'active',
  lastRunAt: '2026-11-02T11:00:00.000Z',
  openIssues: 0,
  showToClient: true,
  order: 0,
  notes: `Disclosure field mapping broke ${SECRET}`,
  whalesyncId: `sync_${SECRET}`,
  issues: [{ code: 'record_error', message: `Field Disclosure rejected ${SECRET}`, table: 'Companies' }],
  authErrors: [`Airtable: needs reconnecting ${SECRET}`],
  refreshError: SECRET,
  refreshedAt: '2026-11-02T11:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: `dev@activeset.co ${SECRET}`,
  updatedAt: '2026-10-01T00:00:00.000Z',
  updatedBy: `dev@activeset.co ${SECRET}`,
  ...overrides,
});

describe('portalContentSyncs', () => {
  it('sends only the allow-listed fields, never notes, issue messages, ids or editors', () => {
    const views = portalContentSyncs([row({ clientNote: 'Updates resume tomorrow', openIssues: 3 })]);
    assert.equal(views.length, 1);
    const allowed = new Set<string>(PORTAL_CONTENT_SYNC_KEYS);
    for (const key of Object.keys(views[0])) assert.ok(allowed.has(key), `unexpected key: ${key}`);
    assert.equal(JSON.stringify(views).includes(SECRET), false);
    assert.deepEqual(views[0], {
      id: 'a',
      name: 'Portfolio companies',
      provider: 'Whalesync',
      source: 'Airtable · Portfolio',
      destination: 'Webflow · Companies',
      state: 'active',
      stateLabel: 'Running',
      lastRunAt: '2026-11-02T11:00:00.000Z',
      openIssues: 3,
      note: 'Updates resume tomorrow',
    });
  });

  it('leaves out hidden and nameless rows and keeps the team order', () => {
    const views = portalContentSyncs([
      row({ id: 'b', name: 'Team', order: 2 }),
      row({ id: 'c', name: 'Hidden', showToClient: false }),
      row({ id: 'd', name: '  ' }),
      row({ id: 'e', name: 'Funds', order: 1 }),
    ]);
    assert.deepEqual(views.map((v) => v.id), ['e', 'b']);
  });

  it('reaches the portal view only through the projection, under `syncs`', () => {
    const project = { id: 'p', name: 'PeakXV', links: [], createdAt: new Date(), updatedAt: new Date() } as unknown as Project;
    const view = buildClientPortalView({ project, timeline: null, contentSyncs: [row()], now: NOW });
    assert.ok(CLIENT_PORTAL_VIEW_KEYS.includes('syncs'));
    assert.equal(view.syncs?.length, 1);
    assert.equal(JSON.stringify(view).includes(SECRET), false);
    const none = buildClientPortalView({ project, timeline: null, now: NOW });
    assert.equal('syncs' in none, false);
  });
});

describe('contentSyncTone', () => {
  it('is fine when running cleanly, worth a look when paused, with issues or late, broken on error', () => {
    assert.equal(contentSyncTone(row(), NOW), 'ok');
    assert.equal(contentSyncTone(row({ openIssues: 2 }), NOW), 'attention');
    assert.equal(contentSyncTone(row({ state: 'paused' }), NOW), 'attention');
    assert.equal(contentSyncTone(row({ lastRunAt: '2026-10-31T00:00:00Z' }), NOW), 'attention');
    assert.equal(contentSyncTone(row({ state: 'error' }), NOW), 'error');
    assert.equal(isContentSyncStale(row({ lastRunAt: undefined }), NOW), false);
  });
});

describe('cleanContentSyncInput', () => {
  it('trims, clears empty fields and refuses bad values', () => {
    const ok = cleanContentSyncInput({ name: '  Funds ', source: '', openIssues: '4', whalesyncId: 'https://app.whalesync.com/syncs/sync_1d0b06b0-6f5e' });
    assert.ok(ok.ok);
    assert.deepEqual(ok.ok && ok.input, { name: 'Funds', source: null, openIssues: 4, whalesyncId: 'sync_1d0b06b0-6f5e' });
    assert.equal(cleanContentSyncInput({ name: '' }).ok, false);
    assert.equal(cleanContentSyncInput({ state: 'broken' }).ok, false);
    assert.equal(cleanContentSyncInput({ openIssues: -1 }).ok, false);
    assert.equal(cleanContentSyncInput({ lastRunAt: 'yesterday' }).ok, false);
    assert.equal(cleanContentSyncInput({ whalesyncId: 'nope' }).ok, false);
    assert.equal(parseWhalesyncId('sync_9f2c1234'), 'sync_9f2c1234');
  });
});

describe('fromWhalesync', () => {
  const api = {
    id: 'sync_1',
    status: 'active',
    open_issues: 2,
    last_synced_at: '2026-11-02T11:30:00Z',
    left: { connector: 'airtable', base: { name: 'Portfolio' }, auth_status: 'connected' },
    right: { connector: 'webflow', base: { name: 'PeakXV site' }, auth_status: 'connected' },
  };

  it('reads status, last run and issues, and fills only empty sides', () => {
    const patch = fromWhalesync(api, [{ code: 'record_error', message: 'Disclosure rejected', table: { name: 'Companies' }, occurrence_count: 3 }], {}, NOW);
    assert.equal(patch.state, 'active');
    assert.equal(patch.openIssues, 2);
    assert.equal(patch.lastRunAt, '2026-11-02T11:30:00.000Z');
    assert.equal(patch.source, 'Airtable · Portfolio');
    assert.equal(patch.destination, 'Webflow · PeakXV site');
    assert.equal(patch.provider, 'Whalesync');
    assert.deepEqual(patch.issues, [{ code: 'record_error', message: 'Disclosure rejected', table: 'Companies', count: 3 }]);
    const kept = fromWhalesync(api, [], { source: 'Airtable', destination: 'Webflow', provider: 'Whalesync' }, NOW);
    assert.equal('source' in kept, false);
    assert.equal('destination' in kept, false);
  });

  it('a side that needs reconnecting is an error; a draft is paused; a first run is running', () => {
    const broken = fromWhalesync({ ...api, right: { ...api.right, auth_status: 'error', auth_error: 'token_expired' } }, [], {}, NOW);
    assert.equal(broken.state, 'error');
    assert.deepEqual(broken.authErrors, ['Webflow: needs reconnecting (token_expired)']);
    assert.equal(fromWhalesync({ ...api, status: 'draft' }, [], {}, NOW).state, 'paused');
    assert.equal(fromWhalesync({ ...api, status: 'paused', initial_sync_running: true }, [], {}, NOW).state, 'active');
  });
});
