import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { imagePathKey, siteAltStatus } from './alt-coverage';

describe('imagePathKey', () => {
  it('matches a site asset across the API host and the page host', () => {
    // Real PeakXV asset: the API says S3, the page loads it from the CDN.
    assert.equal(
      imagePathKey('https://s3.amazonaws.com/webflow-prod-assets/69183d51704ed8e1b1c250fc/6a1d39e94ca6d8d7ad37efaa_Slider-member-image%209.avif'),
      imagePathKey('https://cdn.prod.website-files.com/69183d51704ed8e1b1c250fc/6a1d39e94ca6d8d7ad37efaa_Slider-member-image 9.avif'),
    );
  });
});

describe('siteAltStatus', () => {
  it('puts what visitors see first, whatever the library says', () => {
    // The slider images: ALT set in Webflow, rendered without it by Designer.
    assert.equal(siteAltStatus({ libraryEmpty: false, coverage: { pages: 2, withAlt: 0 }, missingOnSite: true }), 'missing-on-site');
  });

  it('files an empty field the page covers as covered, not missing', () => {
    assert.equal(siteAltStatus({ libraryEmpty: true, coverage: { pages: 3, withAlt: 3 }, missingOnSite: false }), 'covered-by-page');
  });

  it('files an empty field on no page as not on the site', () => {
    assert.equal(siteAltStatus({ libraryEmpty: true, missingOnSite: false }), 'not-on-site');
  });

  it('leaves an image alone when the library has ALT and visitors get it', () => {
    assert.equal(siteAltStatus({ libraryEmpty: false, coverage: { pages: 1, withAlt: 1 }, missingOnSite: false }), 'ok');
  });

  it('does not re-open one a person already settled, e.g. as decorative', () => {
    assert.equal(siteAltStatus({ libraryEmpty: true, coverage: { pages: 1, withAlt: 0 }, missingOnSite: false }), 'ok');
  });
});
