import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { encodeAtWidth } from './image-budget';

/**
 * What the encoder promises, checked against real bytes rather than a mock.
 *
 * The rule it implements is "perceptually lossless, then smallest", and every
 * one of these tests exists because the obvious alternative was measured and
 * found to be worse: lossless everywhere made a real set of site images 88%
 * *larger*, and `animated: false` — which the old encoder passed — turns
 * someone's animated logo into a still of its first frame.
 */

/** Flat colour with a couple of hard edges: what a wordmark or a UI card is. */
async function flatGraphic(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 240, g: 240, b: 245 } },
  })
    .composite([
      {
        input: {
          create: { width: Math.round(width / 2), height: Math.round(height / 2), channels: 3, background: { r: 20, g: 40, b: 200 } },
        },
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

/**
 * Noise stands in for a photograph: continuous tone, nothing to predict.
 *
 * It has to be genuinely high-entropy. A first attempt used `i * k % 251`,
 * which looks random and is in fact periodic enough that lossless compressed
 * it better than q90 did — so the test passed the wrong way round and the
 * fixture, not the encoder, was at fault.
 */
async function photograph(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  // A seeded generator rather than Math.random, so a failure is reproducible.
  let seed = 0x2545f491;
  for (let i = 0; i < pixels.length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    pixels[i] = seed & 0xff;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function animatedGif(): Promise<Buffer> {
  const frame = (value: number) => Buffer.alloc(60 * 60 * 3, value);
  return sharp(Buffer.concat([frame(20), frame(120), frame(220)]), {
    raw: { width: 60, height: 180, channels: 3, pageHeight: 60 },
  })
    .gif({ loop: 0 })
    .toBuffer();
}

describe('encodeAtWidth', () => {
  test('a photograph goes out as q90, because true lossless would be far larger', async () => {
    const original = await photograph(1200, 800);
    const encoded = await encodeAtWidth(original, 600, 'png');

    assert.ok(encoded, 'a photograph at half the width should be worth re-encoding');
    assert.equal(encoded.how, 'WebP q90');
    assert.equal(encoded.ext, 'webp');
  });

  test('a flat graphic goes out lossless, because lossless is smaller there', async () => {
    const original = await flatGraphic(1200, 800);
    const encoded = await encodeAtWidth(original, 600, 'png');

    assert.ok(encoded, 'a flat graphic at half the width should be worth re-encoding');
    assert.equal(encoded.how, 'WebP lossless');
  });

  test('never returns something heavier than what the site already serves', async () => {
    // Already lossless WebP at its display width, so the best we could do is
    // reproduce it — and reproducing it is not a saving.
    const original = await sharp(await flatGraphic(300, 200))
      .webp({ lossless: true, effort: 6 })
      .toBuffer();

    assert.equal(await encodeAtWidth(original, 300, 'webp'), null);
  });

  test('leaves an animation alone rather than publishing its first frame', async () => {
    const original = await animatedGif();
    assert.equal((await sharp(original).metadata()).pages, 3, 'fixture should be animated');

    assert.equal(await encodeAtWidth(original, 30, 'gif'), null);
  });

  test('leaves a vector alone rather than rasterising it to a fixed width', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900"/></svg>');
    assert.equal(await encodeAtWidth(svg, 400, 'svg'), null);
  });

  test('keeps AVIF as AVIF, so a modern format is not downgraded to WebP', async () => {
    const original = await sharp(await photograph(900, 600)).avif({ quality: 50 }).toBuffer();
    const encoded = await encodeAtWidth(original, 450, 'avif');

    assert.ok(encoded);
    assert.equal(encoded.ext, 'avif');
  });
});
