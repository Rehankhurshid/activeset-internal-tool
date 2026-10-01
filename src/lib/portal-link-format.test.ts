import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { isPortalTokenShape, portalKey, portalSlug, portalToken } from './portal-link-format';

describe('portal links', () => {
  it('reads as the client’s name', () => {
    assert.equal(portalSlug('DreamTeam'), 'dreamteam');
    assert.equal(portalSlug('Different AI'), 'different-ai');
    assert.equal(portalSlug('Brain & Being'), 'brain-and-being');
    assert.equal(portalSlug('Café Pérez!'), 'cafe-perez');
    assert.equal(portalSlug('  '), '');
  });

  it('ends in a 12-character key of a-z0-9', () => {
    const token = portalToken('DreamTeam', (n) => randomBytes(n));
    assert.match(token, /^dreamteam-[a-z0-9]{12}$/);
    assert.match(portalToken(undefined, (n) => randomBytes(n)), /^[a-z0-9]{12}$/);
  });

  it('skips bytes that would make some characters likelier', () => {
    const bytes = [255, 252, 0, 35, 36, 71, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let i = 0;
    const key = portalKey((n) => Uint8Array.from({ length: n }, () => bytes[i++ % bytes.length]));
    // 255 and 252 are past the even split (252) and skipped; 0, 35, 36, 71 are a, 9, a, 9.
    assert.equal(key.slice(0, 4), 'a9a9');
  });

  it('accepts new links and old ones, and nothing else', () => {
    assert.ok(isPortalTokenShape('dreamteam-k7f2pq9mx3ab'));
    assert.ok(isPortalTokenShape('k7f2pq9mx3ab'));
    assert.ok(isPortalTokenShape('ZBpN96uWbyCxd7ftn7TbSiK8NqBK_kd6tR8It-11tkQ'));
    assert.ok(!isPortalTokenShape('dreamteam'));
    assert.ok(!isPortalTokenShape('dreamteam-k7f2'));
    assert.ok(!isPortalTokenShape('DreamTeam-k7f2pq9mx3ab'));
    assert.ok(!isPortalTokenShape('../etc/passwd'));
  });
});
