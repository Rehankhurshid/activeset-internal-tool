import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { easeInOutCubic, framesFor, nextStop, scrollFrames } from '@/lib/page-recording/scroll-plan';

describe('scroll plan', () => {
  it('eases from rest to rest', () => {
    assert.equal(easeInOutCubic(0), 0);
    assert.equal(easeInOutCubic(1), 1);
    assert.equal(easeInOutCubic(0.5), 0.5);
    assert.ok(easeInOutCubic(0.1) < 0.1, 'starts slower than linear');
  });

  it('one scroll moves forward every frame and lands exactly on the stop', () => {
    const frames = scrollFrames(0, 765, framesFor(900, 60));
    assert.equal(frames.length, 54);
    assert.equal(frames.at(-1), 765);
    for (let i = 1; i < frames.length; i += 1) assert.ok(frames[i] >= frames[i - 1]);
  });

  it('steps most of a screen, never past the bottom', () => {
    assert.equal(nextStop(0, 900, 5000, 0.85), 765);
    assert.equal(nextStop(4800, 900, 5000, 0.85), 5000);
    assert.equal(nextStop(0, 900, 0, 0.85), 0);
  });
});
