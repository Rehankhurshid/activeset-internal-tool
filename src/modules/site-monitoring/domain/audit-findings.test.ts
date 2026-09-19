import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AuditResult, ProjectLink } from '@/types';
import {
  collectFindings,
  decisionId,
  findingsForPage,
  fixListMarkdown,
  fixesRollup,
  imageFingerprint,
  linkFingerprint,
  readinessOf,
  webflowAssetIdFrom,
  type AuditDecision,
} from './audit-findings';

const CDN = 'https://cdn.prod.website-files.com/69f1f98e16ad2a104acb7580';

function page(
  id: string,
  audit: Partial<AuditResult> & { images?: { src: string; alt?: string; inMainContent?: boolean }[] },
): ProjectLink {
  const { images, ...rest } = audit;
  return {
    id,
    title: `Page ${id}`,
    url: `https://example.com/${id}`,
    order: 0,
    auditResult: {
      score: 90,
      summary: '',
      canDeploy: true,
      lastRun: '2026-09-20T10:00:00Z',
      ...rest,
      contentSnapshot: {
        title: '',
        h1: '',
        metaDescription: '',
        wordCount: 100,
        headings: [],
        ...(images ? { images } : {}),
      } as AuditResult['contentSnapshot'],
      categories: rest.categories ?? {},
    } as AuditResult,
  };
}

const decision = (partial: Partial<AuditDecision> & Pick<AuditDecision, 'kind' | 'fingerprint' | 'decision'>): AuditDecision => ({
  id: decisionId(partial.kind, partial.fingerprint),
  by: 'rehan@activeset.co',
  at: '2026-09-20T12:00:00Z',
  ...partial,
});

describe('fingerprints', () => {
  it('treats query-string variants of an image as one asset', () => {
    assert.equal(imageFingerprint(`${CDN}/a_hero.png?w=100`), imageFingerprint(`${CDN}/a_hero.png?w=800`));
  });

  it('drops the fragment but keeps the query on links', () => {
    assert.equal(linkFingerprint('https://Example.com/a?x=1#top'), 'https://example.com/a?x=1');
    assert.notEqual(linkFingerprint('https://example.com/a?x=1'), linkFingerprint('https://example.com/a?x=2'));
  });

  it('recovers the Webflow asset id from the CDN filename, and nothing else', () => {
    assert.equal(webflowAssetIdFrom(`${CDN}/69f1f98e16ad2a104acb7581_udemy1.webp`), '69f1f98e16ad2a104acb7581');
    assert.equal(webflowAssetIdFrom('https://example.com/69f1f98e16ad2a104acb7581_x.png'), null);
    assert.equal(webflowAssetIdFrom(`${CDN}/logo.png`), null);
  });

  it('gives a decision a safe, stable document id', () => {
    const id = decisionId('alt', 'cdn.example.com/a/b/c.png');
    assert.match(id, /^alt_[0-9a-f]{16}$/);
    assert.equal(id, decisionId('alt', 'cdn.example.com/a/b/c.png'));
    assert.notEqual(id, decisionId('link', 'cdn.example.com/a/b/c.png'));
  });
});

describe('collectFindings', () => {
  it('rolls one template image on many pages into one finding', () => {
    const shared = `${CDN}/69f1f98e16ad2a104acb7581_team.webp`;
    const links = ['a', 'b', 'c'].map((id) => page(id, { images: [{ src: `${shared}?v=${id}` }] }));
    const { alt } = collectFindings(links);
    assert.equal(alt.length, 1);
    assert.equal(alt[0].pages.length, 3);
    assert.equal(alt[0].webflowAssetId, '69f1f98e16ad2a104acb7581');
    assert.equal(alt[0].state, 'open');
  });

  it('ignores images that have alt, and the audit’s own social and screenshot images', () => {
    const links = [
      page('a', {
        screenshotUrl: 'https://storage/shot.png',
        categories: { openGraph: { status: 'passed', hasOpenGraph: true, image: 'https://example.com/og.png' } } as AuditResult['categories'],
        images: [
          { src: 'https://example.com/og.png' },
          { src: 'https://storage/shot.png' },
          { src: 'https://example.com/described.png', alt: 'A team photo' },
          { src: 'https://example.com/screenshot-of-dashboard.png' },
        ],
      }),
    ];
    const { alt } = collectFindings(links);
    assert.deepEqual(alt.map((f) => f.src), ['https://example.com/screenshot-of-dashboard.png']);
  });

  it('collapses one dead destination on many pages into one finding with every anchor text', () => {
    const links = ['a', 'b'].map((id) =>
      page(id, {
        categories: {
          links: {
            status: 'failed', totalLinks: 5, internalLinks: 5, externalLinks: 0, score: 80, checkedAt: '2026-09-20T09:00:00Z',
            brokenLinks: [{ href: 'https://example.com/old#frag', status: 404, text: id === 'a' ? 'Read more' : 'Old page' }],
          },
        } as AuditResult['categories'],
      }),
    );
    const { links: broken } = collectFindings(links);
    assert.equal(broken.length, 1);
    assert.equal(broken[0].pages.length, 2);
    assert.deepEqual(broken[0].texts.sort(), ['Old page', 'Read more']);
  });

  it('keeps bot-blocked links apart from broken ones', () => {
    const links = [
      page('a', {
        categories: {
          links: {
            status: 'passed', totalLinks: 2, internalLinks: 0, externalLinks: 2, score: 100,
            brokenLinks: [],
            unverifiableLinks: [{ href: 'https://linkedin.com/in/x', status: 999, text: 'LinkedIn', reason: 'bot-block' }],
          },
        } as unknown as AuditResult['categories'],
      }),
    ];
    const f = collectFindings(links);
    assert.equal(f.links.length, 0);
    assert.equal(f.unverifiable.length, 1);
    assert.equal(f.unverifiable[0].status, 999);
  });

  it('orders likely-decorative images last and shared images first', () => {
    const links = [
      page('a', {
        categories: {
          judgment: {
            checkedAt: '2026-09-20T10:00:00Z',
            altText: [{ src: 'https://example.com/divider.svg', alt: '', decorative: 0.9 }],
          },
        } as AuditResult['categories'],
        images: [{ src: 'https://example.com/divider.svg' }, { src: 'https://example.com/shared.png' }, { src: 'https://example.com/solo.png' }],
      }),
      page('b', { images: [{ src: 'https://example.com/shared.png' }] }),
    ];
    const { alt } = collectFindings(links);
    assert.deepEqual(alt.map((f) => f.src), [
      'https://example.com/shared.png',
      'https://example.com/solo.png',
      'https://example.com/divider.svg',
    ]);
    assert.equal(alt[2].decorative, 0.9);
  });

  it('orders dead links by whether a visitor would click them', () => {
    const links = [
      page('a', {
        categories: {
          links: {
            status: 'failed', totalLinks: 2, internalLinks: 2, externalLinks: 0, score: 60,
            brokenLinks: [
              { href: 'https://example.com/cookies', status: 404, text: 'Cookie policy' },
              { href: 'https://example.com/contact', status: 404, text: 'Start a project' },
            ],
          },
          judgment: {
            checkedAt: '2026-09-20T10:00:00Z',
            brokenLinks: [
              { href: 'https://example.com/cookies', text: 'Cookie policy', matters: 0.15 },
              { href: 'https://example.com/contact', text: 'Start a project', matters: 0.9 },
            ],
          },
        } as AuditResult['categories'],
      }),
    ];
    const { links: broken } = collectFindings(links);
    assert.deepEqual(broken.map((f) => f.href), ['https://example.com/contact', 'https://example.com/cookies']);
  });
});

describe('decisions', () => {
  const src = 'https://example.com/hero.png';
  const fp = imageFingerprint(src);

  it('decorative resolves a finding for good', () => {
    const links = [page('a', { images: [{ src }] })];
    const { alt } = collectFindings(links, [decision({ kind: 'alt', fingerprint: fp, decision: 'decorative' })]);
    assert.equal(alt[0].state, 'resolved');
  });

  it('a fix stays unverified until a page is scanned after it', () => {
    const links = [page('a', { images: [{ src }] })]; // checked 10:00, decision 12:00
    const { alt } = collectFindings(links, [decision({ kind: 'alt', fingerprint: fp, decision: 'fixed_unverified', altText: 'Hero' })]);
    assert.equal(alt[0].state, 'fixed_unverified');
  });

  it('a fix that a later scan still sees missing comes back as regressed', () => {
    const links = [
      page('a', {
        categories: { seo: { status: 'passed', score: 100, issues: [], imageScanCheckedAt: '2026-09-20T13:00:00Z' } } as unknown as AuditResult['categories'],
        images: [{ src }],
      }),
    ];
    const verified = collectFindings(links, [decision({ kind: 'alt', fingerprint: fp, decision: 'verified' })]);
    assert.equal(verified.alt[0].state, 'regressed');
    const unverified = collectFindings(links, [decision({ kind: 'alt', fingerprint: fp, decision: 'fixed_unverified' })]);
    assert.equal(unverified.alt[0].state, 'regressed');
  });

  it('an ignored link leaves the open list', () => {
    const href = 'https://example.com/old';
    const links = [
      page('a', {
        categories: {
          links: { status: 'failed', totalLinks: 1, internalLinks: 1, externalLinks: 0, score: 80, brokenLinks: [{ href, status: 404, text: 'x' }] },
        } as AuditResult['categories'],
      }),
    ];
    const { links: broken } = collectFindings(links, [
      decision({ kind: 'link', fingerprint: linkFingerprint(href), decision: 'ignored', reason: 'page coming next week' }),
    ]);
    assert.equal(broken[0].state, 'resolved');
    assert.equal(fixesRollup(collectFindings(links, broken.map((b) => b.decision!))).length, 0);
  });
});

describe('fixesRollup and readiness', () => {
  const shared = `${CDN}/69f1f98e16ad2a104acb7581_team.webp`;
  const links = [
    ...['p1', 'p2', 'p3'].map((id) => page(id, { images: [{ src: shared }] })),
    page('solo', { images: [{ src: shared }, { src: 'https://example.com/only-here.png' }] }),
    page('blocked', { canDeploy: false }),
    page('clean', {}),
    { id: 'never', title: 'Never', url: 'https://example.com/never', order: 0 } as ProjectLink,
  ];
  const findings = collectFindings(links);

  it('counts one template fix as one fix that clears every page carrying it', () => {
    const rollup = fixesRollup(findings);
    const sharedGroup = rollup.find((g) => g.id === 'alt_shared');
    assert.deepEqual(sharedGroup, { id: 'alt_shared', fixes: 1, pagesCleared: 4, flagsCleared: 4 });
    const singleGroup = rollup.find((g) => g.id === 'alt_single');
    assert.deepEqual(singleGroup, { id: 'alt_single', fixes: 1, pagesCleared: 1, flagsCleared: 1 });
    assert.equal(rollup.some((g) => g.id.startsWith('links')), false);
  });

  it('derives each page’s readiness from the findings it carries', () => {
    const by = Object.fromEntries(links.map((l) => [l.id, readinessOf(l, findings)]));
    assert.equal(by.p1, 'template_fix_pending');
    assert.equal(by.solo, 'fix_needed');
    assert.equal(by.blocked, 'blocked');
    assert.equal(by.clean, 'ready');
    assert.equal(by.never, 'unscanned');
  });

  it('lists exactly the open findings that touch one page', () => {
    const own = findingsForPage(findings, 'solo');
    assert.equal(own.alt.length, 2);
    assert.equal(findingsForPage(findings, 'clean').alt.length, 0);
  });

  it('names the blocked page', () => {
    assert.deepEqual(findings.blocked.map((p) => p.pageId), ['blocked']);
  });

  it('writes a fix list someone can paste into Slack', () => {
    const md = fixListMarkdown(findings, 'example.com');
    assert.match(md, /^# Fix list — example\.com/);
    assert.match(md, /## Placeholder copy/);
    assert.match(md, /69f1f98e16ad2a104acb7581_team\.webp \| 4 pages/);
    assert.match(md, /only-here\.png \| example\.com\/solo/);
  });
});
