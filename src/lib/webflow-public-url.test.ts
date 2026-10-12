import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWebflowPageUrl,
  candidateWebflowBaseUrls,
  extractWebflowSiteId,
  isAuditablePage,
  resolveWebflowPublicBaseUrl,
  resolveWebflowSitemapUrl,
  urlHintsFromWebflowSitePayload,
  webflowConfigToUrlHints,
} from './webflow-public-url';

describe('candidateWebflowBaseUrls', () => {
  it('lists the saved domain, then the webflow.io subdomain', () => {
    assert.deepEqual(
      candidateWebflowBaseUrls({ customDomain: 'www.example.com', shortName: 'Acme-Site' }),
      ['https://www.example.com', 'https://acme-site.webflow.io']
    );
  });

  it('does not repeat the subdomain when it is also the saved domain', () => {
    assert.deepEqual(
      candidateWebflowBaseUrls({ customDomain: 'acme.webflow.io/', shortName: 'acme' }),
      ['https://acme.webflow.io']
    );
  });
});

describe('resolveWebflowPublicBaseUrl', () => {
  it('prefers custom domain', () => {
    assert.equal(
      resolveWebflowPublicBaseUrl({ customDomain: 'www.example.com', shortName: 'mysite' }),
      'https://www.example.com'
    );
  });

  it('falls back to shortName.webflow.io', () => {
    assert.equal(resolveWebflowPublicBaseUrl({ shortName: 'Acme-Site' }), 'https://acme-site.webflow.io');
  });
});

describe('urlHintsFromWebflowSitePayload', () => {
  it('ignores previewUrl, which is a screenshot, not a host', () => {
    assert.deepEqual(
      urlHintsFromWebflowSitePayload({
        shortName: 'different-ai',
        previewUrl: 'https://screenshots.webflow.com/sites/abc/shot.png',
      }),
      { shortName: 'different-ai' }
    );
  });
});

describe('resolveWebflowSitemapUrl', () => {
  it('keeps an explicit project sitemap URL', () => {
    assert.equal(
      resolveWebflowSitemapUrl({}, 'https://www.example.com/sitemap.xml'),
      'https://www.example.com/sitemap.xml'
    );
  });

  it('derives sitemap.xml from staging base when unset', () => {
    assert.equal(resolveWebflowSitemapUrl({ shortName: 'demo' }), 'https://demo.webflow.io/sitemap.xml');
  });
});

describe('webflowConfigToUrlHints', () => {
  it('maps stored config fields', () => {
    assert.deepEqual(webflowConfigToUrlHints({ siteId: 'abc', shortName: 'demo' }), {
      customDomain: undefined,
      shortName: 'demo',
    });
  });
});

describe('extractWebflowSiteId', () => {
  it('reads data-wf-site from the html tag', () => {
    assert.equal(
      extractWebflowSiteId('<html data-wf-domain="x.webflow.io" data-wf-page="1" data-wf-site="6AA399E5899BF4175EDF7A7C">'),
      '6aa399e5899bf4175edf7a7c'
    );
  });

  it('returns null for a page not on Webflow', () => {
    assert.equal(extractWebflowSiteId('<html lang="en">'), null);
  });
});

describe('isAuditablePage', () => {
  it('keeps published static pages', () => {
    assert.equal(isAuditablePage({ publishedPath: '/about' }), true);
    assert.equal(isAuditablePage({ publishedPath: '/' }), true);
  });

  it('drops drafts, archived, error pages and CMS templates', () => {
    assert.equal(isAuditablePage({ publishedPath: '/style-guide', draft: true }), false);
    assert.equal(isAuditablePage({ publishedPath: '/old', archived: true }), false);
    assert.equal(isAuditablePage({ publishedPath: '/404' }), false);
    assert.equal(isAuditablePage({ publishedPath: '/401' }), false);
    assert.equal(isAuditablePage({ publishedPath: '/blog', collectionId: 'c1' }), false);
  });
});

describe('buildWebflowPageUrl', () => {
  it('joins base and publishedPath', () => {
    assert.equal(buildWebflowPageUrl('https://demo.webflow.io', '/about'), 'https://demo.webflow.io/about');
  });
});
