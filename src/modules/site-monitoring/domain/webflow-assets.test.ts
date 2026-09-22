import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  idPrefixOf,
  normaliseAssetName,
  resolveAssets,
  type WebflowAssetSummary,
} from './webflow-assets';

/**
 * Written from the real Canopy data that exposed the bug: eleven images
 * needing alt text, and the id parsed from the URL matched an asset for none
 * of them.
 */

const asset = (over: Partial<WebflowAssetSummary> & { id: string }): WebflowAssetSummary => ({
  displayName: 'photo.png',
  hostedUrl: 'https://s3.amazonaws.com/webflow-prod-assets/site/aaaaaaaaaaaaaaaaaaaaaaaa_photo.png',
  ...over,
});

describe('the prefix is a hint, not an id', () => {
  it('reads the prefix when there is one', () => {
    assert.equal(
      idPrefixOf('https://cdn.prod.website-files.com/x/69ceb7fbbefa23b1a863f597_photo.webp'),
      '69ceb7fbbefa23b1a863f597',
    );
    assert.equal(idPrefixOf('https://example.com/plain.png'), null);
  });
});

describe('normalising a name', () => {
  it('ignores everything that differs between one image’s many URLs', () => {
    const variants = [
      '69ceb82583e8cb333a04525e_20220929_CanapyHeadshots8143a 1.png',
      '20220929_CanapyHeadshots8143a%201-p-500.png',
      '20220929_canapyheadshots8143a-1.webp',
    ];
    const [first, ...rest] = variants.map(normaliseAssetName);
    for (const other of rest) assert.equal(other, first);
  });
});

describe('resolveAssets', () => {
  it('matches a variant URL exactly', () => {
    const assets = [
      asset({
        id: 'realassetid000000000001',
        displayName: 'hero.png',
        hostedUrl: 'https://s3.amazonaws.com/webflow-prod-assets/s/abc_hero.png',
        variants: [{ hostedUrl: 'https://s3.amazonaws.com/webflow-prod-assets/s/abc_hero-p-800.png' }],
      }),
    ];
    const src = 'https://cdn.prod.website-files.com/s/abc_hero-p-800.png';
    assert.deepEqual(resolveAssets([src], assets), { [src]: 'realassetid000000000001' });
  });

  it('falls back to the file name when the URL differs', () => {
    const assets = [asset({ id: 'byname01', displayName: 'Reyn.png' })];
    const src = 'https://cdn.prod.website-files.com/s/69ceb66bc89c98206d658003_Reyn.webp';
    assert.deepEqual(resolveAssets([src], assets), { [src]: 'byname01' });
  });

  it('refuses to guess when two assets share a name', () => {
    // Writing alt text to the wrong one is worse than offering nothing.
    const assets = [
      asset({ id: 'first01', displayName: 'hero.png', hostedUrl: 'https://x/a_hero.png' }),
      asset({ id: 'second1', displayName: 'hero.webp', hostedUrl: 'https://x/b_hero.webp' }),
    ];
    const ambiguous = 'https://cdn.prod.website-files.com/s/69ceb6df94d2957c89eb8bb5_hero.jpg';
    assert.deepEqual(resolveAssets([ambiguous], assets), {});
  });

  it('returns nothing for a CMS image, which is the case that broke', () => {
    // The id in the page URL looks exactly like an asset id and is not one.
    const assets = [asset({ id: 'siteasset1', displayName: 'unrelated.png' })];
    const cmsImage = 'https://cdn.prod.website-files.com/s/69ae5fb108c5ea9f30ede18c_fritz.webp';
    assert.deepEqual(resolveAssets([cmsImage], assets), {});
    // ...even though a prefix is happily parseable from it.
    assert.equal(idPrefixOf(cmsImage), '69ae5fb108c5ea9f30ede18c');
  });

  it('resolves only what it can, leaving the rest out', () => {
    const assets = [asset({ id: 'known01', displayName: 'known.png' })];
    const srcs = [
      'https://cdn.prod.website-files.com/s/69ceb66bc89c98206d658003_known.webp',
      'https://cdn.prod.website-files.com/s/69ae5fb108c5ea9f30ede18c_unknown.webp',
    ];
    const result = resolveAssets(srcs, assets);
    assert.deepEqual(Object.keys(result), [srcs[0]]);
  });
});
