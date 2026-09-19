import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkBrokenLinks,
  classifyStatus,
  clearLinkCheckCache,
  normalizeLinkUrl,
  runPool,
} from './LinkCheckerService';
import { TtlCache } from './LinkCheckCache';

const PAGE = 'https://www.example.com/about';

type Call = { url: string; method: string };

/**
 * A fetch stub driven by a status table. `Response` refuses to construct with
 * a status outside 200-599, and 999 is the whole point, so it returns bare
 * objects with the two fields the checker reads.
 */
type Outcome = number | 'timeout' | Error;

function stubFetch(statuses: Record<string, Outcome | ((method: string) => Outcome)>) {
  const calls: Call[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    const rule = statuses[url];
    const outcome = typeof rule === 'function' ? rule(method) : rule ?? 200;
    if (outcome instanceof Error) return Promise.reject(outcome);
    if (outcome === 'timeout') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
        });
      });
    }
    return Promise.resolve({ status: outcome, body: null } as unknown as Response);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function dnsFailure(): Error {
  return Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
}

function link(href: string, text = href, isExternal = true) {
  return { href, text, isExternal };
}

beforeEach(() => clearLinkCheckCache());

test('normalizeLinkUrl resolves relative hrefs, drops the fragment and keeps the query', () => {
  assert.deepEqual(normalizeLinkUrl('/team#leadership', PAGE), {
    kind: 'url',
    url: 'https://www.example.com/team',
  });
  assert.deepEqual(normalizeLinkUrl('?page=2', PAGE), {
    kind: 'url',
    url: 'https://www.example.com/about?page=2',
  });
  assert.deepEqual(normalizeLinkUrl('HTTPS://WWW.Example.com:443/x', PAGE), {
    kind: 'url',
    url: 'https://www.example.com/x',
  });
});

test('normalizeLinkUrl skips non-web schemes and bare anchors, flags garbage', () => {
  for (const href of ['#top', 'mailto:hi@example.com', 'tel:+123', 'javascript:void(0)', 'sms:123', '']) {
    assert.deepEqual(normalizeLinkUrl(href, PAGE), { kind: 'skip' }, href);
  }
  assert.deepEqual(normalizeLinkUrl('http://[bad', PAGE), { kind: 'invalid' });
  assert.deepEqual(normalizeLinkUrl('/x', 'not a url'), { kind: 'invalid' });
});

test('classifyStatus separates broken from unverifiable', () => {
  assert.equal(classifyStatus(200).verdict, 'ok');
  assert.equal(classifyStatus(301).verdict, 'ok');
  for (const status of [400, 404, 410, 500, 502, 503, 0]) {
    assert.equal(classifyStatus(status).verdict, 'broken', String(status));
  }
  assert.deepEqual(classifyStatus(999), { verdict: 'unverifiable', status: 999, reason: 'bot-blocked' });
  assert.deepEqual(classifyStatus(403), { verdict: 'unverifiable', status: 403, reason: 'bot-blocked' });
  assert.deepEqual(classifyStatus(429), { verdict: 'unverifiable', status: 429, reason: 'rate-limited' });
  assert.deepEqual(classifyStatus(401), { verdict: 'unverifiable', status: 401, reason: 'auth-required' });
  assert.deepEqual(classifyStatus(405), { verdict: 'unverifiable', status: 405, reason: 'method-refused' });
});

test('duplicates are fetched once and every original link gets a row', async () => {
  const { fetchImpl, calls } = stubFetch({
    'https://www.example.com/missing': 404,
    'https://www.linkedin.com/in/someone': 999,
  });
  const links = [
    link('/missing', 'Nav: Missing'),
    link('/missing#footer', 'Footer: Missing'),
    link('https://www.linkedin.com/in/someone', 'Nav: LinkedIn'),
    link('https://www.linkedin.com/in/someone', 'Footer: LinkedIn'),
    link('/team', 'Team'),
    link('/team', 'Team again'),
    link('#top', 'Back to top'),
    link('mailto:hi@example.com', 'Email'),
  ];

  const summary = await checkBrokenLinks(links, PAGE, { fetchImpl, useCache: false });

  assert.equal(calls.length, 3, 'one HEAD per unique URL');
  assert.deepEqual(new Set(calls.map((c) => c.url)), new Set([
    'https://www.example.com/missing',
    'https://www.linkedin.com/in/someone',
    'https://www.example.com/team',
  ]));
  assert.equal(summary.totalLinks, 8);
  assert.equal(summary.uniqueUrls, 3);
  assert.equal(summary.totalChecked, 8);
  assert.deepEqual(summary.brokenLinks.map((b) => b.text), ['Nav: Missing', 'Footer: Missing']);
  assert.deepEqual(summary.unverifiableLinks.map((u) => u.text), ['Nav: LinkedIn', 'Footer: LinkedIn']);
  assert.equal(summary.unverifiableLinks[0].status, 999);
  assert.equal(summary.unverifiableLinks[0].reason, 'bot-blocked');
  // Skipped schemes and in-page anchors count as valid, as they always did.
  assert.equal(summary.validLinks, 4);
});

test('bot-block statuses are never retried with GET; 405 is', async () => {
  const { fetchImpl, calls } = stubFetch({
    'https://www.linkedin.com/in/a': 999,
    'https://waf.example.net/': 403,
    'https://limited.example.net/': 429,
    'https://nohead.example.net/': (method) => (method === 'HEAD' ? 405 : 200),
    'https://nomethod.example.net/': 405,
  });
  const summary = await checkBrokenLinks(
    [
      link('https://www.linkedin.com/in/a'),
      link('https://waf.example.net/'),
      link('https://limited.example.net/'),
      link('https://nohead.example.net/'),
      link('https://nomethod.example.net/'),
    ],
    PAGE,
    { fetchImpl, useCache: false }
  );

  const methodsFor = (url: string) => calls.filter((c) => c.url === url).map((c) => c.method);
  assert.deepEqual(methodsFor('https://www.linkedin.com/in/a'), ['HEAD']);
  assert.deepEqual(methodsFor('https://waf.example.net/'), ['HEAD']);
  assert.deepEqual(methodsFor('https://limited.example.net/'), ['HEAD']);
  assert.deepEqual(methodsFor('https://nohead.example.net/'), ['HEAD', 'GET']);
  assert.deepEqual(methodsFor('https://nomethod.example.net/'), ['HEAD', 'GET']);

  assert.equal(summary.validLinks, 1);
  assert.equal(summary.brokenLinks.length, 0);
  assert.deepEqual(
    summary.unverifiableLinks.map((u) => [u.status, u.reason]),
    [[999, 'bot-blocked'], [403, 'bot-blocked'], [429, 'rate-limited'], [405, 'method-refused']]
  );
});

test('DNS failure is broken without a GET retry; a reset socket earns one', async () => {
  const { fetchImpl, calls } = stubFetch({
    'https://gone.example.net/': () => dnsFailure(),
    'https://flaky.example.net/': (method) =>
      method === 'HEAD'
        ? Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
        : 200,
  });
  const summary = await checkBrokenLinks(
    [link('https://gone.example.net/'), link('https://flaky.example.net/')],
    PAGE,
    { fetchImpl, useCache: false }
  );
  assert.deepEqual(calls.filter((c) => c.url.startsWith('https://gone')).map((c) => c.method), ['HEAD']);
  assert.deepEqual(calls.filter((c) => c.url.startsWith('https://flaky')).map((c) => c.method), ['HEAD', 'GET']);
  assert.equal(summary.brokenLinks.length, 1);
  assert.equal(summary.brokenLinks[0].status, 0);
  assert.match(summary.brokenLinks[0].error ?? '', /ENOTFOUND/);
  assert.equal(summary.validLinks, 1);
});

test('a timeout is broken, unless the host already showed it blocks bots', async () => {
  const { fetchImpl } = stubFetch({
    'https://slow.example.net/': 'timeout',
    'https://www.linkedin.com/in/a': 999,
    'https://www.linkedin.com/company/b': 'timeout',
  });
  const first = await checkBrokenLinks(
    [link('https://slow.example.net/'), link('https://www.linkedin.com/in/a')],
    PAGE,
    { fetchImpl, headTimeoutMs: 5, timeoutMs: 5 }
  );
  assert.deepEqual(first.brokenLinks.map((b) => [b.href, b.error]), [['https://slow.example.net/', 'Timeout']]);

  const second = await checkBrokenLinks([link('https://www.linkedin.com/company/b')], PAGE, {
    fetchImpl,
    headTimeoutMs: 5,
    timeoutMs: 5,
  });
  assert.equal(second.brokenLinks.length, 0);
  assert.deepEqual(second.unverifiableLinks.map((u) => u.reason), ['timeout-on-blocking-host']);
});

test('the cache spares the second page every request the first page made', async () => {
  const { fetchImpl, calls } = stubFetch({ 'https://www.example.com/missing': 404 });
  const footer = [link('https://www.linkedin.com/in/a'), link('/missing'), link('https://partner.example.net/')];

  const page1 = await checkBrokenLinks(footer, 'https://www.example.com/', { fetchImpl });
  const afterPage1 = calls.length;
  const page2 = await checkBrokenLinks(footer, 'https://www.example.com/pricing', { fetchImpl });

  assert.equal(afterPage1, 3);
  assert.equal(calls.length, afterPage1, 'no new requests for the second page');
  assert.deepEqual(page2.brokenLinks, page1.brokenLinks);
  assert.equal(page2.validLinks, 2);

  await checkBrokenLinks(footer, 'https://www.example.com/contact', { fetchImpl, useCache: false });
  assert.equal(calls.length, afterPage1 + 3, 'useCache:false re-fetches');
});

test('maxLinksToCheck caps unique URLs after dedupe and the page itself is free', async () => {
  const { fetchImpl, calls } = stubFetch({});
  const links = [
    link('/a'), link('/a'), link('/a'),
    link('/b'), link('/b'),
    link(PAGE), link('#section'),
    link('/c'),
  ];
  const summary = await checkBrokenLinks(links, PAGE, { fetchImpl, useCache: false, maxLinksToCheck: 2 });

  assert.deepEqual(calls.map((c) => c.url), ['https://www.example.com/a', 'https://www.example.com/b']);
  // /a x3, /b x2, the self link and the anchor are settled; /c was over the cap.
  assert.equal(summary.totalChecked, 7);
  assert.equal(summary.totalLinks, 8);
  assert.equal(summary.uniqueUrls, 4);
});

test('invalid hrefs are reported broken with status 0', async () => {
  const { fetchImpl, calls } = stubFetch({});
  const summary = await checkBrokenLinks([link('http://[bad', 'Broken markup')], PAGE, {
    fetchImpl,
    useCache: false,
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(summary.brokenLinks, [
    { href: 'http://[bad', text: 'Broken markup', status: 0, error: 'Invalid URL format' },
  ]);
});

test('runPool keeps input order and never exceeds its limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const started: number[] = [];
  const results = await runPool([30, 5, 20, 1, 15, 2], 3, async (delay, index) => {
    started.push(index);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delay));
    inFlight -= 1;
    return delay * 2;
  });
  assert.deepEqual(results, [60, 10, 40, 2, 30, 4]);
  assert.equal(peak, 3);
  // Lanes pull the next item as soon as they free up, so the slow first item
  // does not hold back the fourth from starting.
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
});

test('runPool with an empty list resolves to an empty array', async () => {
  assert.deepEqual(await runPool([], 8, async () => 1), []);
});

test('TtlCache expires, bounds its size and shares in-flight work', async () => {
  const cache = new TtlCache<number>(2);
  cache.set('a', 1, 100, 0);
  assert.equal(cache.get('a', 50), 1);
  assert.equal(cache.get('a', 100), undefined, 'expired at the boundary');

  cache.set('a', 1, 1000, 0);
  cache.set('b', 2, 1000, 0);
  cache.get('a', 1);
  cache.set('c', 3, 1000, 2);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b', 3), undefined, 'least recently used goes first');
  assert.equal(cache.get('a', 3), 1);

  let computed = 0;
  const compute = () => new Promise<number>((resolve) => setTimeout(() => { computed += 1; resolve(9); }, 5));
  const [x, y] = await Promise.all([
    cache.resolve('k', compute, () => 1000),
    cache.resolve('k', compute, () => 1000),
  ]);
  assert.equal(x, 9);
  assert.equal(y, 9);
  assert.equal(computed, 1);
});

test('a same-site link missing on staging is re-checked on the live origin', async () => {
  const { fetchImpl, calls } = stubFetch({
    'https://site.webflow.io/enroll': 404,
    'https://www.site.com/enroll': 200,
    'https://site.webflow.io/gone': 404,
    'https://www.site.com/gone': 404,
    'https://other.example/x': 404,
  });
  const result = await checkBrokenLinks(
    [link('/enroll', 'Get started', false), link('/gone', 'Old', false), link('https://other.example/x')],
    'https://site.webflow.io/pricing',
    { fetchImpl, useCache: false, liveOrigin: 'https://www.site.com/pricing' }
  );
  // The app route exists on the live host: not broken.
  assert.deepEqual(result.brokenLinks.map((b) => b.href).sort(), ['/gone', 'https://other.example/x']);
  assert.equal(result.validLinks, 1);
  // Live re-check only for same-site paths; the external 404 is not retried elsewhere.
  assert.ok(calls.some((c) => c.url === 'https://www.site.com/enroll'));
  assert.ok(calls.some((c) => c.url === 'https://www.site.com/gone'));
  assert.equal(calls.filter((c) => c.url.startsWith('https://www.site.com/x')).length, 0);
});

test('without a live origin, or when it matches the page, nothing is re-checked', async () => {
  const { fetchImpl, calls } = stubFetch({ 'https://www.site.com/enroll': 404 });
  await checkBrokenLinks([link('/enroll', 'x', false)], 'https://www.site.com/', {
    fetchImpl,
    useCache: false,
    liveOrigin: 'https://www.site.com/',
  });
  assert.equal(calls.length, 1);
});
