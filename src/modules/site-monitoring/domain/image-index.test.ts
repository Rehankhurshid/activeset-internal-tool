import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { optimiseSettled, type ImageIndexEntry } from './image-index';

const entry = (optimise: ImageIndexEntry['optimise']): ImageIndexEntry => ({
  fingerprint: 'cdn.test/a.webp',
  src: 'https://cdn.test/a.webp',
  optimise,
  updatedAt: '2026-09-23T00:00:00Z',
});
const at = '2026-09-23T00:00:00Z';

describe('optimiseSettled', () => {
  it('does an image nobody has touched', () => {
    assert.equal(optimiseSettled(undefined, null).settled, false);
  });

  it('never re-encodes our own output at its own size — no second lossy generation', () => {
    assert.equal(optimiseSettled(entry({ state: 'optimised', at, width: null }), null).settled, true);
  });

  it('skips an image already checked and found as small as it gets', () => {
    // PeakXV Teams: 60 of 77 were re-downloaded and re-encoded every run to learn this.
    assert.equal(optimiseSettled(entry({ state: 'already-optimal', at, width: null }), null).settled, true);
  });

  it('does it again when a new measurement asks for a narrower width', () => {
    assert.equal(optimiseSettled(entry({ state: 'already-optimal', at, width: null }), 800).settled, false);
    assert.equal(optimiseSettled(entry({ state: 'optimised', at, width: 1200 }), 800).settled, false);
  });

  it('skips when it was already done at that width or narrower', () => {
    assert.equal(optimiseSettled(entry({ state: 'optimised', at, width: 800 }), 800).settled, true);
    assert.equal(optimiseSettled(entry({ state: 'optimised', at, width: 600 }), 800).settled, true);
  });

  it('retries a failure', () => {
    assert.equal(optimiseSettled(entry({ state: 'failed', at, width: null, error: '429' }), null).settled, false);
  });

  it('does not make a second Designer copy', () => {
    assert.equal(optimiseSettled(entry({ state: 'designer-copy', at, width: 890 }), 890).settled, true);
  });
});
