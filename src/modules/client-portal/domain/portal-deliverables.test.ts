import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectLink } from '@/types';
import { cleanSharedWith, nextDeliverableVersion, portalDeliverables } from './portal-deliverables';
import { portalLinks } from './portal-links';

const link = (overrides: Partial<ProjectLink> & Pick<ProjectLink, 'id'>): ProjectLink => ({
  title: 'Founders list',
  url: `https://docs.google.com/spreadsheets/d/${overrides.id}`,
  order: 0,
  source: 'manual',
  clientVisible: true,
  ...overrides,
});

describe('portalDeliverables', () => {
  it('groups versions of one deliverable, latest first, and orders deliverables by their latest share', () => {
    const result = portalDeliverables([
      link({ id: 'a1', version: 1, sharedAt: '2026-09-01' }),
      link({ id: 'b1', title: 'Event report', version: 1, sharedAt: '2026-09-15' }),
      link({ id: 'a3', version: 3, sharedAt: '2026-09-20', deliverableId: 'a1' }),
      link({ id: 'a2', version: 2, sharedAt: '2026-09-10', deliverableId: 'a1' }),
    ]);
    assert.deepEqual(
      result.map((d) => [d.id, d.versions.map((v) => v.id)]),
      [
        ['a1', ['a3', 'a2', 'a1']],
        ['b1', ['b1']],
      ],
    );
  });

  it('leaves out auto links, links not switched on, and anything that is not a web address', () => {
    const result = portalDeliverables([
      link({ id: 'x1', source: 'auto' }),
      link({ id: 'x2', clientVisible: false }),
      link({ id: 'x3', url: 'javascript:alert(1)' }),
      link({ id: 'ok' }),
    ]);
    assert.deepEqual(result.map((d) => d.id), ['ok']);
  });

  it('keeps only title, address, version, day and names; drops bad dates and versions', () => {
    const [d] = portalDeliverables([
      { ...link({ id: 'a', version: 0, sharedAt: '10/09/2026', sharedWith: 'Shruthi; shruthi@peakxv.com, Arjun' }), isDefault: true, locale: 'en' },
    ]);
    assert.deepEqual(d.versions[0], { id: 'a', title: 'Founders list', url: 'https://docs.google.com/spreadsheets/d/a', sharedWith: 'Shruthi, Arjun' });
  });

  it('reaches the sidebar as the latest version only', () => {
    const deliverables = portalDeliverables([
      link({ id: 'a1', version: 1, sharedAt: '2026-09-01' }),
      link({ id: 'a2', version: 2, sharedAt: '2026-09-10', deliverableId: 'a1' }),
    ]);
    const links = portalLinks({ stages: [], files: [], deliverables });
    assert.deepEqual(links.map((l) => [l.url, l.note]), [['https://docs.google.com/spreadsheets/d/a2', 'Deliverable · v2 · shared 10 Sep']]);
  });
});

describe('nextDeliverableVersion', () => {
  it('is one past the highest version, or the count when versions were not numbered', () => {
    const links = [link({ id: 'a1', version: 1 }), link({ id: 'a2', version: 4, deliverableId: 'a1' }), link({ id: 'b1' })];
    assert.equal(nextDeliverableVersion(links, 'a1'), 5);
    assert.equal(nextDeliverableVersion(links, 'b1'), 2);
  });
});

describe('cleanSharedWith', () => {
  it('keeps names once each and never an address', () => {
    assert.equal(cleanSharedWith(' Shruthi , Shruthi,\nme@x.com '), 'Shruthi');
    assert.equal(cleanSharedWith('a@b.com'), undefined);
    assert.equal(cleanSharedWith(undefined), undefined);
  });
});
