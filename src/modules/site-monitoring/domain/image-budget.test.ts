import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TARGET_WIDTH,
  assessImageWeight,
  estimateBytesAtWidth,
  formatBytes,
  retinaTarget,
  summariseWeight,
  widestRendered,
  type ImageMeasurement,
} from './image-budget';

function measurement(over: Partial<ImageMeasurement> = {}): ImageMeasurement {
  return {
    src: 'https://cdn.test/hero.webp',
    renderedWidth: 600,
    intrinsicWidth: 1200,
    intrinsicHeight: 800,
    bytes: 200_000,
    format: 'webp',
    ...over,
  };
}

describe('retina target', () => {
  it('is twice the width the image is displayed at', () => {
    assert.equal(retinaTarget(200), 400);
    assert.equal(retinaTarget(612), 1224);
  });

  it('stops where extra pixels stop being visible', () => {
    assert.equal(retinaTarget(4000), MAX_TARGET_WIDTH);
  });
});

describe('assessing one image', () => {
  it('calls an image displayed far smaller than its file oversized', () => {
    // The real case from activeset.co: a 3494px, 1 MB JPEG in a 200px slot.
    const result = assessImageWeight(
      measurement({ renderedWidth: 200, intrinsicWidth: 3494, bytes: 1_045_000, format: 'jpeg' }),
    );
    assert.equal(result.verdict, 'oversized');
    assert.equal(result.targetWidth, 400);
    assert.ok(result.worthDoing);
    assert.ok(result.estimatedSaving > 900_000, `saving was ${result.estimatedSaving}`);
    assert.match(result.reason, /never displayed above 200px/);
  });

  it('calls an image smaller than twice its slot undersized, not oversized', () => {
    const result = assessImageWeight(measurement({ renderedWidth: 600, intrinsicWidth: 700 }));
    assert.equal(result.verdict, 'undersized');
    assert.equal(result.targetWidth, 1200);
    assert.match(result.reason, /soft on a retina screen/);
    // Nothing to save by shrinking something already too small.
    assert.equal(result.estimatedSaving, 0);
  });

  it('leaves an image that is already about right alone', () => {
    assert.equal(assessImageWeight(measurement({ renderedWidth: 600, intrinsicWidth: 1200 })).verdict, 'right');
    assert.equal(assessImageWeight(measurement({ renderedWidth: 600, intrinsicWidth: 1300 })).verdict, 'right');
    assert.equal(assessImageWeight(measurement({ renderedWidth: 600, intrinsicWidth: 1500 })).verdict, 'oversized');
  });

  it('will not churn an asset for a saving nobody would notice', () => {
    const result = assessImageWeight(
      measurement({ renderedWidth: 300, intrinsicWidth: 1000, bytes: 28_000 }),
    );
    assert.equal(result.verdict, 'oversized');
    assert.equal(result.worthDoing, false);
    assert.match(result.reason, /not worth a re-upload/);
  });

  it('refuses to judge an image whose file it could not read', () => {
    // Regression from the first real run: a fetch failure left bytes at 0 and
    // the width fell back to the browser's naturalWidth — which, with a
    // srcset, is the variant the browser picked rather than the asset. That
    // produced a confident "too small" about a file nobody had seen.
    const result = assessImageWeight(
      measurement({ renderedWidth: 448, intrinsicWidth: 768, bytes: 0, format: '' }),
    );
    assert.equal(result.verdict, 'not_applicable');
    assert.match(result.reason, /could not be fetched/);
  });

  it('never judges a vector', () => {
    const result = assessImageWeight(measurement({ format: 'svg', intrinsicWidth: 32, renderedWidth: 400 }));
    assert.equal(result.verdict, 'not_applicable');
    assert.match(result.reason, /vector/);
  });

  it('never judges an image the page does not display', () => {
    assert.equal(assessImageWeight(measurement({ renderedWidth: 0 })).verdict, 'not_applicable');
    assert.equal(assessImageWeight(measurement({ hidden: true })).verdict, 'not_applicable');
  });

  it('says so when there is no srcset, because then every visitor pays', () => {
    const shared = { renderedWidth: 300, intrinsicWidth: 2400, bytes: 800_000 };
    const withoutSrcset = assessImageWeight(measurement({ ...shared, hasSrcset: false }));
    assert.equal(withoutSrcset.everyVisitorPays, true);
    assert.match(withoutSrcset.reason, /every visitor downloads this exact file/);

    const withSrcset = assessImageWeight(measurement({ ...shared, hasSrcset: true }));
    assert.equal(withSrcset.everyVisitorPays, false);
    assert.doesNotMatch(withSrcset.reason, /every visitor/);
  });
});

describe('estimating the saving', () => {
  it('scales with area, because that is how pixels work', () => {
    assert.equal(estimateBytesAtWidth(1000, 1000, 500), 250);
  });

  it('never claims a saving from making something bigger', () => {
    assert.equal(estimateBytesAtWidth(1000, 500, 1000), 1000);
    assert.equal(estimateBytesAtWidth(1000, 0, 500), 1000);
  });
});

describe('roll-up', () => {
  const assessments = [
    assessImageWeight(measurement({ src: 'a', renderedWidth: 200, intrinsicWidth: 3494, bytes: 1_045_000 })),
    assessImageWeight(measurement({ src: 'b', renderedWidth: 600, intrinsicWidth: 700, bytes: 90_000 })),
    assessImageWeight(measurement({ src: 'c', renderedWidth: 600, intrinsicWidth: 1200, bytes: 120_000 })),
    assessImageWeight(measurement({ src: 'd', format: 'svg' })),
  ];

  it('counts only what it could actually judge', () => {
    const summary = summariseWeight(assessments);
    assert.equal(summary.measured, 3);
    assert.equal(summary.oversized, 1);
    assert.equal(summary.undersized, 1);
    assert.equal(summary.right, 1);
    assert.equal(summary.totalBytes, 1_255_000);
    assert.ok(summary.estimatedSaving > 900_000);
  });
});

describe('the widest slot wins', () => {
  it('takes the largest width across viewports, and remembers which', () => {
    const result = widestRendered([
      { viewport: 1440, width: 612 },
      { viewport: 768, width: 344 },
      { viewport: 390, width: 358 },
    ]);
    assert.deepEqual(result, { width: 612, viewport: 1440 });
  });

  it('copes with an image no viewport displayed', () => {
    assert.deepEqual(widestRendered([]), { width: 0, viewport: undefined });
  });
});

describe('formatBytes', () => {
  it('reads the way a person would say it', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2 KB');
    assert.equal(formatBytes(1_500_000), '1.4 MB');
  });
});
