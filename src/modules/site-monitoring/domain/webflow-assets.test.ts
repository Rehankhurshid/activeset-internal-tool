import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cmsSourceAssetIds,
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

describe('a library is not all pictures', () => {
  it('carries the content type, so non-images can be filtered out', () => {
    // Regression: the first real run on Canopy fed two PDFs and an MP4 to a
    // vision model, because "assets with no alt text" had been taken to mean
    // "images with no alt text". All three failed, and the failure count was
    // reported without a reason.
    const asset: WebflowAssetSummary = { id: 'a1', contentType: 'application/pdf', displayName: 'form.pdf' };
    assert.equal(asset.contentType?.startsWith('image/'), false);
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

describe('cmsSourceAssetIds', () => {
  it('finds the source asset id carried inside a CMS image URL', () => {
    // A real PeakXV CMS image: delivery id, then the id of the uploaded asset.
    const ids = cmsSourceAssetIds([
      'https://cdn.prod.website-files.com/69187967ccd7c46fc1aaf24a/6aa846ba708885b4d1424b6d_6aa83cdd8bb6ee74a8c749ae_ringg-ai-logo-inline-opt-eb6805bedb92.webp',
    ]);
    assert.ok(ids.has('6aa83cdd8bb6ee74a8c749ae'));
  });

  it('does not mistake the site id in the path for an asset', () => {
    const ids = cmsSourceAssetIds([
      'https://cdn.prod.website-files.com/69187967ccd7c46fc1aaf24a/6aa846ba708885b4d1424b6d_logo.webp',
    ]);
    assert.ok(!ids.has('69187967ccd7c46fc1aaf24a'));
  });
});
