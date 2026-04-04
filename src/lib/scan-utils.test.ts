import test from 'node:test';
import assert from 'node:assert/strict';

import type { AuditResult } from '@/types';

import { compactAuditResult } from './scan-utils';

function buildLargeAuditResult(): AuditResult {
  return {
    score: 78,
    summary: 'Summary '.repeat(120),
    canDeploy: false,
    fullHash: 'full-hash',
    contentHash: 'content-hash',
    changeStatus: 'CONTENT_CHANGED',
    lastRun: '2026-04-04T12:00:00.000Z',
    contentSnapshot: {
      title: 'Title '.repeat(60),
      h1: 'Heading '.repeat(60),
      metaDescription: 'Description '.repeat(80),
      wordCount: 5421,
      headings: Array.from({ length: 30 }, (_, idx) => `Heading ${idx} `.repeat(10)),
      images: Array.from({ length: 20 }, (_, idx) => ({
        src: `https://cdn.example.com/assets/${idx}?${'q'.repeat(150)}`,
        alt: idx % 2 === 0 ? '' : `Image alt ${idx} `.repeat(20),
        inMainContent: idx % 3 === 0,
      })),
      links: [],
      sections: [],
      bodyTextHash: 'body-hash',
      bodyTextPreview: 'Preview '.repeat(200),
    } as AuditResult['contentSnapshot'],
    fieldChanges: Array.from({ length: 12 }, (_, idx) => ({
      field: `field-${idx}`,
      oldValue: `Old ${idx} `.repeat(40),
      newValue: `New ${idx} `.repeat(40),
      changeType: 'modified' as const,
    })),
    diffSummary: 'Diff '.repeat(120),
    diffPatch: 'Patch '.repeat(300),
    screenshot: 'data:image/png;base64,' + 'a'.repeat(5000),
    previousScreenshot: 'data:image/png;base64,' + 'b'.repeat(5000),
    mobileScreenshot: 'mobile',
    tabletScreenshot: 'tablet',
    desktopScreenshot: 'desktop',
    categories: {
      placeholders: {
        status: 'failed',
        issues: Array.from({ length: 10 }, (_, idx) => ({ type: `Placeholder ${idx} `.repeat(8), count: idx + 1 })),
        score: 0,
      },
      spelling: {
        status: 'warning',
        issues: Array.from({ length: 16 }, (_, idx) => ({
          word: `misspelled-${idx}`.repeat(8),
          suggestion: `suggestion-${idx}`.repeat(8),
        })),
        score: 42,
      },
      readability: {
        status: 'passed',
        score: 100,
        fleschScore: 45,
        wordCount: 5421,
        sentenceCount: 321,
        label: 'Hard',
      },
      completeness: {
        status: 'warning',
        issues: Array.from({ length: 10 }, (_, idx) => ({
          check: `Check ${idx} `.repeat(10),
          detail: `Detail ${idx} `.repeat(20),
        })),
        score: 60,
      },
      seo: {
        status: 'warning',
        issues: Array.from({ length: 14 }, (_, idx) => `SEO issue ${idx} `.repeat(20)),
        title: 'SEO Title '.repeat(40),
        titleLength: 400,
        metaDescription: 'SEO Description '.repeat(50),
        metaDescriptionLength: 700,
        imagesWithoutAlt: 9,
        score: 40,
      },
      technical: {
        status: 'warning',
        issues: Array.from({ length: 12 }, (_, idx) => `Technical issue ${idx} `.repeat(20)),
        score: 50,
      },
      schema: {
        status: 'warning',
        hasSchema: true,
        schemaTypes: Array.from({ length: 10 }, (_, idx) => `SchemaType-${idx}`.repeat(5)),
        issues: Array.from({ length: 9 }, (_, idx) => ({
          type: `Schema ${idx} `.repeat(8),
          message: `Schema issue ${idx} `.repeat(20),
        })),
        rawSchemas: Array.from({ length: 4 }, (_, idx) => ({ id: idx, payload: 'x'.repeat(400) })),
        score: 65,
      },
      links: {
        status: 'failed',
        totalLinks: 40,
        internalLinks: 22,
        externalLinks: 18,
        brokenLinks: Array.from({ length: 11 }, (_, idx) => ({
          href: `https://example.com/broken/${idx}?${'z'.repeat(120)}`,
          status: 404,
          text: `Broken link ${idx} `.repeat(20),
          error: `Error ${idx} `.repeat(20),
        })),
        checkedAt: '2026-04-04T12:00:00.000Z',
        score: 20,
      },
      openGraph: {
        status: 'warning',
        hasOpenGraph: true,
        title: 'OG Title '.repeat(30),
        description: 'OG Description '.repeat(40),
        image: 'https://cdn.example.com/og-image?' + 'o'.repeat(220),
        url: 'https://example.com/' + 'u'.repeat(220),
        type: 'website',
        issues: Array.from({ length: 8 }, (_, idx) => `OG issue ${idx} `.repeat(18)),
        score: 60,
      },
      twitterCards: {
        status: 'info',
        hasTwitterCards: true,
        card: 'summary_large_image',
        title: 'Twitter Title '.repeat(25),
        description: 'Twitter Description '.repeat(35),
        image: 'https://cdn.example.com/twitter-image?' + 't'.repeat(220),
        issues: Array.from({ length: 8 }, (_, idx) => `Twitter issue ${idx} `.repeat(18)),
        score: 70,
      },
      metaTags: {
        status: 'warning',
        canonicalUrl: 'https://example.com/' + 'c'.repeat(220),
        hasViewport: true,
        viewport: 'width=device-width, initial-scale=1',
        language: 'en-US',
        robots: 'index,follow',
        favicon: 'https://example.com/favicon?' + 'f'.repeat(220),
        issues: Array.from({ length: 8 }, (_, idx) => `Meta issue ${idx} `.repeat(18)),
        score: 75,
      },
      headingStructure: {
        status: 'warning',
        headings: Array.from({ length: 25 }, (_, idx) => ({ level: (idx % 3) + 1, text: `Heading structure ${idx} `.repeat(12) })),
        h1Count: 2,
        issues: Array.from({ length: 8 }, (_, idx) => `Heading issue ${idx} `.repeat(18)),
        score: 68,
      },
      accessibility: {
        status: 'failed',
        score: 30,
        issues: Array.from({ length: 14 }, (_, idx) => ({
          type: idx % 2 === 0 ? 'alt-text' : 'aria',
          severity: idx % 3 === 0 ? 'error' : 'warning',
          element: `<div data-node="${idx}">${'e'.repeat(120)}</div>`,
          message: `Accessibility issue ${idx} `.repeat(18),
        })),
        ariaLandmarks: Array.from({ length: 9 }, (_, idx) => `landmark-${idx}`),
        hasSkipLink: false,
        formInputsWithoutLabels: 5,
        linksWithGenericText: 8,
      },
    },
  };
}

test('compactAuditResult trims heavy audit payloads for project storage', () => {
  const compact = compactAuditResult(buildLargeAuditResult());

  assert.equal(compact.diffPatch, undefined);
  assert.equal(compact.screenshot, undefined);
  assert.equal(compact.previousScreenshot, undefined);
  assert.equal(compact.categories.schema?.rawSchemas?.length, 0);
  assert.equal(compact.contentSnapshot?.headings.length, 8);
  assert.equal((compact.contentSnapshot as { images?: unknown[] })?.images?.length, 8);
  assert.equal(compact.categories.spelling.issues.length, 10);
  assert.equal(compact.categories.links?.brokenLinks.length, 8);
  assert.equal(compact.fieldChanges?.length, 8);
  assert.ok((compact.diffSummary || '').length <= 323);
});

test('more aggressive compact levels produce smaller serialized payloads', () => {
  const source = buildLargeAuditResult();
  const standard = compactAuditResult(source, 'standard');
  const aggressive = compactAuditResult(source, 'aggressive');
  const minimal = compactAuditResult(source, 'minimal');

  const standardSize = JSON.stringify(standard).length;
  const aggressiveSize = JSON.stringify(aggressive).length;
  const minimalSize = JSON.stringify(minimal).length;

  assert.ok(aggressiveSize < standardSize);
  assert.ok(minimalSize < aggressiveSize);
  assert.equal(minimal.categories.spelling.issues.length, 4);
  assert.equal(minimal.categories.accessibility?.issues.length, 5);
  assert.equal(minimal.categories.links?.brokenLinks.length, 3);
  assert.equal(minimal.fieldChanges?.length, 4);
});
