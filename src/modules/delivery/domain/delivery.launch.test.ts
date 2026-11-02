import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectLink } from '@/types';
import {
  cmsFoldersOf,
  gapFolders,
  launchPlan,
  liveOriginOf,
  openSitemapGap,
  sitemapGap,
  suggestLiveOrigin,
  titleForSitemapPath,
} from './delivery.launch';

const page = (id: string, path: string, stagingLink?: string, order = 0) => ({
  id,
  title: id,
  path,
  order,
  ...(stagingLink ? { stagingLink } : {}),
});

const link = (title: string, url: string, extra: Partial<ProjectLink> = {}): ProjectLink => ({
  id: title,
  title,
  url,
  order: 0,
  ...extra,
});

describe('liveOriginOf', () => {
  it('reduces whatever the team types to an origin', () => {
    assert.equal(liveOriginOf('acme.com'), 'https://acme.com');
    assert.equal(liveOriginOf('https://www.acme.com/'), 'https://www.acme.com');
    assert.equal(liveOriginOf('https://www.acme.com/sitemap.xml'), 'https://www.acme.com');
    assert.equal(liveOriginOf('ftp://acme.com'), null);
    assert.equal(liveOriginOf('localhost'), null);
    assert.equal(liveOriginOf(''), null);
  });
});

describe('suggestLiveOrigin', () => {
  it('prefers a recorded launch, then the custom domain, then a Live link, then the sitemap', () => {
    assert.equal(
      suggestLiveOrigin({ delivery: { launch: { launchedAt: 'x', liveOrigin: 'https://a.com', fromHosts: [], rewritten: 0, linked: 0 } }, webflowConfig: { customDomain: 'b.com' } }),
      'https://a.com',
    );
    assert.equal(suggestLiveOrigin({ webflowConfig: { customDomain: 'www.b.com' } }), 'https://www.b.com');
    assert.equal(suggestLiveOrigin({ links: [link('Live site', 'https://c.com/home')] }), 'https://c.com');
    assert.equal(suggestLiveOrigin({ sitemapUrl: 'https://d.com/sitemap.xml' }), 'https://d.com');
  });

  it('never suggests a staging host, or a sitemap page that happens to say "live"', () => {
    assert.equal(suggestLiveOrigin({ sitemapUrl: 'https://acme.webflow.io/sitemap.xml' }), undefined);
    assert.equal(suggestLiveOrigin({ links: [link('Live demo', 'https://e.com/demo', { source: 'auto' })] }), undefined);
  });
});

describe('launchPlan', () => {
  const pages = [
    page('pricing', '/pricing', 'https://acme.webflow.io/pricing?x=1#top', 1),
    page('home', '/', 'https://acme.webflow.io/', 0),
    page('careers', '/careers', undefined, 2),
    page('about', '/about', 'https://www.acme.com/about', 3),
    page('imported', 'https://acme.webflow.io/contact', undefined, 4),
  ];

  it('moves every other host to the live one, keeping the path, in grid order', () => {
    const plan = launchPlan(pages, 'www.acme.com/');
    assert.equal(plan.liveOrigin, 'https://www.acme.com');
    assert.deepEqual(plan.rewrites, [
      { pageId: 'home', title: 'home', from: 'https://acme.webflow.io/', to: 'https://www.acme.com/' },
      { pageId: 'pricing', title: 'pricing', from: 'https://acme.webflow.io/pricing?x=1#top', to: 'https://www.acme.com/pricing?x=1#top' },
    ]);
    assert.deepEqual(plan.fromHosts, ['acme.webflow.io']);
    assert.equal(plan.alreadyLive, 1);
  });

  it('offers a live link to pages that have none, at their path', () => {
    const plan = launchPlan(pages, 'https://www.acme.com');
    assert.deepEqual(plan.unlinked, [
      { pageId: 'careers', title: 'careers', to: 'https://www.acme.com/careers' },
      { pageId: 'imported', title: 'imported', to: 'https://www.acme.com/contact' },
    ]);
  });

  it('changes nothing the second time', () => {
    const first = launchPlan(pages, 'https://www.acme.com');
    const after = pages.map((p) => {
      const change = [...first.rewrites, ...first.unlinked].find((c) => c.pageId === p.id);
      return change ? { ...p, stagingLink: change.to } : p;
    });
    const second = launchPlan(after, 'https://www.acme.com');
    assert.equal(second.rewrites.length + second.unlinked.length, 0);
    assert.equal(second.alreadyLive, pages.length);
  });

  it('refuses something that is not an address', () => {
    assert.throws(() => launchPlan(pages, 'not a site'));
  });
});

describe('sitemapGap', () => {
  const sitemap = [
    'https://www.acme.com/',
    'https://www.acme.com/pricing/',
    'https://www.acme.com/careers',
    'https://www.acme.com/contact',
    'https://www.acme.com/vdp',
    'https://www.acme.com/blog',
    'https://www.acme.com/blog/post-one',
    'https://www.acme.com/blog/post-two',
    'https://www.acme.com/legal/privacy',
    'https://www.acme.com/Careers',
  ];
  const tracker = [page('home', '/'), page('pricing', '/Pricing'), page('contact', 'contact-us', 'https://acme.webflow.io/contact')];

  it('lists the static pages no row covers, by path or by link, leaving out CMS items', () => {
    const gap = sitemapGap(sitemap, tracker, { cmsFolders: ['/blog/*'] });
    assert.deepEqual(
      gap.missing.map((m) => m.path),
      ['/blog', '/careers', '/legal/privacy', '/vdp'],
    );
    assert.equal(gap.cmsSkipped, 2);
    assert.equal(gap.sitemapCount, 9, 'the same path twice counts once');
  });

  it('leaves out what the team ignored, one path or a whole folder', () => {
    const gap = sitemapGap(sitemap, tracker, { cmsFolders: ['/blog/*'], ignore: ['/vdp', '/legal/*'] });
    assert.deepEqual(gap.missing.map((m) => m.path), ['/blog', '/careers']);
  });

  it('drops what was added or ignored since the check', () => {
    const gap = sitemapGap(sitemap, tracker, { cmsFolders: ['/blog/*'] });
    const open = openSitemapGap(gap, [...tracker, page('careers', '/careers')], ['/vdp']);
    assert.deepEqual(open.map((m) => m.path), ['/blog', '/legal/privacy']);
  });
});

describe('cmsFoldersOf', () => {
  it('reads collection folders from the project and the scanned links', () => {
    const folders = cmsFoldersOf({
      folderPageTypes: { '/news/*': 'collection', '/features/*': 'static' },
      links: [
        link('/blog/post', 'https://acme.com/blog/post', { source: 'auto', pageType: 'collection' }),
        link('/about', 'https://acme.com/about', { source: 'auto', pageType: 'static' }),
      ],
    });
    assert.deepEqual(folders, ['/blog/*', '/news/*']);
  });
});

describe('gapFolders and titles', () => {
  it('groups a folder with several missing pages', () => {
    const missing = ['/a', '/docs/one', '/docs/two', '/docs/three', '/x/y'].map((path) => ({ path }));
    assert.deepEqual(gapFolders(missing), [{ pattern: '/docs/*', count: 3 }]);
  });

  it('names a page from its slug', () => {
    assert.equal(titleForSitemapPath('/careers/open-roles/'), 'Open Roles');
    assert.equal(titleForSitemapPath('/'), 'Homepage');
  });
});
