import type { LinkInfo } from '@/types';
import { TtlCache } from './LinkCheckCache';

export interface BrokenLinkInfo {
  href: string;
  text: string;
  status: number;
  error?: string;
}

/**
 * Why a link could not be verified. These are refusals aimed at us as a bot,
 * not answers about whether the URL exists, so they are reported apart from
 * broken links rather than counted with them.
 */
export type UnverifiableReason =
  | 'bot-blocked'
  | 'rate-limited'
  | 'auth-required'
  | 'method-refused'
  | 'timeout-on-blocking-host';

export interface UnverifiableLinkInfo {
  href: string;
  text: string;
  status: number;
  reason: UnverifiableReason;
}

export interface BrokenLinkCheckSummary {
  /** Original links that received a verdict (skipped schemes included). */
  totalChecked: number;
  totalLinks: number;
  /** Distinct URLs after normalisation. The gap to totalLinks is nav/footer repetition. */
  uniqueUrls: number;
  brokenLinks: BrokenLinkInfo[];
  /** Links we could not prove either way. Show as "could not verify", not as broken. */
  unverifiableLinks: UnverifiableLinkInfo[];
  validLinks: number;
  checkedAt: string;
  durationMs: number;
}

export type LinkVerdict = 'ok' | 'broken' | 'unverifiable';

/** The settled answer for one normalised URL, shared by every link that points at it. */
export interface UrlVerdict {
  verdict: LinkVerdict;
  status: number;
  error?: string;
  reason?: UnverifiableReason;
}

export interface LinkCheckOptions {
  /** Cap on distinct URLs fetched. Applied after dedupe so repeats do not eat the budget. */
  maxLinksToCheck?: number;
  /** Budget for the GET retry, the request that only happens when HEAD was inconclusive. */
  timeoutMs?: number;
  /** Budget for the first HEAD. */
  headTimeoutMs?: number;
  /** Requests in flight at once. */
  concurrency?: number;
  /** @deprecated Older name for `concurrency`, kept so existing callers keep working. */
  batchSize?: number;
  /** Set false to bypass the cross-page verdict cache (tests, one-off re-checks). */
  useCache?: boolean;
  /** Injection point for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

type ResolvedOptions = {
  maxLinksToCheck: number;
  timeoutMs: number;
  headTimeoutMs: number;
  concurrency: number;
  useCache: boolean;
  fetchImpl: typeof fetch;
};

const DEFAULT_OPTIONS = {
  maxLinksToCheck: 50,
  // HEAD is headers-only and every healthy server answers it well inside three
  // seconds. A HEAD that has not answered by then is nearly always a server that
  // mishandles HEAD, and we would rather move on to the GET than sit on a slot.
  headTimeoutMs: 3000,
  // The GET is the second chance, so it gets the more patient budget. Worst case
  // for one URL is 8 s, but it occupies one pool slot rather than a whole batch.
  timeoutMs: 5000,
  concurrency: 10,
  useCache: true,
};

// Verdicts other than transient failures are good for the length of a scan.
// A sitemap crawl of 40 pages finishes well inside this window, which is what
// lets the footer's LinkedIn link cost one request per lambda instead of forty.
const VERDICT_TTL_MS = 5 * 60 * 1000;
// Timeouts, connection failures and 5xx are re-tried sooner: a blip should not
// be reported for five minutes, but it also should not cost 8 s on every page.
const TRANSIENT_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

const verdictCache = new TtlCache<UrlVerdict>(CACHE_MAX_ENTRIES);
// Hosts that have answered with a bot-block code recently. A later timeout on
// the same host is that host stalling a suspected bot, not a dead link.
const blockingHosts = new TtlCache<true>(500);

/** Drop every memoised verdict. For tests and for a deliberate re-check. */
export function clearLinkCheckCache(): void {
  verdictCache.clear();
  blockingHosts.clear();
}

export type NormalizedLink =
  | { kind: 'url'; url: string }
  | { kind: 'skip' }
  | { kind: 'invalid' };

function isSkippableHref(href: string): boolean {
  const lower = href.toLowerCase();
  return (
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('sms:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('#')
  );
}

/**
 * Resolve an href to the absolute URL we would fetch, or say why we would not.
 *
 * The fragment goes: the server never sees it, so `/about#team` and `/about`
 * are one request. The query string stays: `?page=2` and `?id=99` are distinct
 * resources that can each 404 on their own, and stripping only tracking params
 * would buy little since a site's own markup rarely carries them. Everything
 * else (host case, default ports, dot segments) is normalised by the URL class.
 */
export function normalizeLinkUrl(href: string, pageUrl: string): NormalizedLink {
  const trimmed = href.trim();
  // Checked on the raw href, before resolution turns `#team` into a full URL
  // that no longer starts with `#`. The previous version checked after resolving
  // and re-fetched the page once per in-page anchor.
  if (trimmed === '' || isSkippableHref(trimmed)) return { kind: 'skip' };

  let url: URL;
  try {
    url = new URL(trimmed, pageUrl);
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'skip' };
  url.hash = '';
  return { kind: 'url', url: url.toString() };
}

/**
 * Turn a final status into a verdict. Method-specific retries are decided by
 * the caller; this only says what a status means once we have stopped asking.
 *
 * Unverifiable codes and why:
 * - 999: LinkedIn's bot-block. Every LinkedIn profile returns it to a script.
 * - 403: what Cloudflare, Akamai and most WAFs return to an unfamiliar
 *   User-Agent. A genuine 403 on a public link is rare and, from here,
 *   indistinguishable from a bot block.
 * - 429: rate limited, and the burst that caused it was ours.
 * - 401: the page exists behind a login. A visitor with an account gets through.
 * - 405 / 501: the server refuses the method. Only reached when the GET retry
 *   was refused too, so nothing about the URL itself has been learned.
 *
 * Broken stays: 404, 410, every other 4xx, all 5xx, and status 0 (DNS, refused
 * connection, TLS failure, timeout).
 */
export function classifyStatus(status: number): UrlVerdict {
  if (status === 999 || status === 403) return { verdict: 'unverifiable', status, reason: 'bot-blocked' };
  if (status === 429) return { verdict: 'unverifiable', status, reason: 'rate-limited' };
  if (status === 401) return { verdict: 'unverifiable', status, reason: 'auth-required' };
  if (status === 405 || status === 501) return { verdict: 'unverifiable', status, reason: 'method-refused' };
  if (status >= 200 && status < 400) return { verdict: 'ok', status };
  return { verdict: 'broken', status };
}

function needsGetRetry(status: number): boolean {
  return status === 405 || status === 501;
}

/**
 * Run `worker` over `items` with at most `limit` in flight, continuously.
 * A slow item delays one lane, not a whole round. Results keep input order.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

const REQUEST_HEADERS = {
  'User-Agent': 'ActiveSet-LinkChecker/1.0 (+https://activeset.co)',
  Accept: '*/*',
};

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(input, {
      method,
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    // The status is all we want. Cancelling the body stops the GET retry from
    // downloading the whole page, which is what made it cost as much as it did.
    void response.body?.cancel().catch(() => undefined);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function transportCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === 'string' ? cause.code : undefined;
}

// Failures that no change of method can fix. Retrying a GET after the DNS
// lookup failed only doubles the wait for the same answer.
const METHOD_INDEPENDENT_FAILURES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function worthRetryingWithGet(error: unknown): boolean {
  // A stalled HEAD is usually a server that mishandles HEAD; a reset socket is
  // often a WAF dropping HEAD. Either can still answer a GET.
  if (isAbortError(error)) return true;
  const code = transportCode(error);
  return code === undefined || !METHOD_INDEPENDENT_FAILURES.has(code);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function failureVerdict(error: unknown, url: string): UrlVerdict {
  if (isAbortError(error)) {
    if (blockingHosts.get(hostOf(url))) {
      return { verdict: 'unverifiable', status: 0, reason: 'timeout-on-blocking-host' };
    }
    return { verdict: 'broken', status: 0, error: 'Timeout' };
  }
  if (error instanceof Error) {
    const code = transportCode(error);
    return { verdict: 'broken', status: 0, error: code ? `${error.message} (${code})` : error.message };
  }
  return { verdict: 'broken', status: 0, error: 'Unknown error' };
}

function recordVerdict(url: string, verdict: UrlVerdict): UrlVerdict {
  if (verdict.reason === 'bot-blocked' || verdict.reason === 'rate-limited') {
    blockingHosts.set(hostOf(url), true, VERDICT_TTL_MS);
  }
  return verdict;
}

/**
 * Fetch one URL and settle on a verdict. Never throws.
 *
 * HEAD first. The only statuses that earn a GET retry are 405 and 501, where the
 * server has told us it is the method it dislikes. A 999, 403 or 429 *is* the
 * server's answer to us; asking again with GET just spends a second request and
 * another five seconds to hear it twice.
 */
async function checkUrl(url: string, cfg: ResolvedOptions): Promise<UrlVerdict> {
  try {
    const head = await fetchWithTimeout(cfg.fetchImpl, url, 'HEAD', cfg.headTimeoutMs);
    if (!needsGetRetry(head.status)) return recordVerdict(url, classifyStatus(head.status));
  } catch (error) {
    if (!worthRetryingWithGet(error)) return failureVerdict(error, url);
  }

  try {
    const get = await fetchWithTimeout(cfg.fetchImpl, url, 'GET', cfg.timeoutMs);
    return recordVerdict(url, classifyStatus(get.status));
  } catch (error) {
    return failureVerdict(error, url);
  }
}

function ttlFor(verdict: UrlVerdict): number {
  const transient = verdict.status === 0 || verdict.status >= 500;
  return transient ? TRANSIENT_TTL_MS : VERDICT_TTL_MS;
}

function resolveOptions(options?: LinkCheckOptions): ResolvedOptions {
  return {
    maxLinksToCheck: options?.maxLinksToCheck ?? DEFAULT_OPTIONS.maxLinksToCheck,
    timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    headTimeoutMs: options?.headTimeoutMs ?? DEFAULT_OPTIONS.headTimeoutMs,
    concurrency: options?.concurrency ?? options?.batchSize ?? DEFAULT_OPTIONS.concurrency,
    useCache: options?.useCache ?? DEFAULT_OPTIONS.useCache,
    fetchImpl: options?.fetchImpl ?? fetch,
  };
}

// The page itself was fetched by the scanner moments before this runs, so its
// in-page anchors are settled without a request.
const SELF_VERDICT: UrlVerdict = { verdict: 'ok', status: 200 };

export async function checkBrokenLinks(
  links: Pick<LinkInfo, 'href' | 'text' | 'isExternal'>[],
  pageUrl: string,
  options?: LinkCheckOptions
): Promise<BrokenLinkCheckSummary> {
  const startedAt = Date.now();
  const cfg = resolveOptions(options);

  const normalized = links.map((link) => normalizeLinkUrl(link.href, pageUrl));
  const self = normalizeLinkUrl(pageUrl, pageUrl);
  const selfUrl = self.kind === 'url' ? self.url : undefined;

  // One entry per distinct URL, in first-seen order so the cap keeps the links
  // nearest the top of the document when it bites.
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  for (const entry of normalized) {
    if (entry.kind !== 'url' || seen.has(entry.url)) continue;
    seen.add(entry.url);
    uniqueUrls.push(entry.url);
  }

  const verdicts = new Map<string, UrlVerdict>();
  if (selfUrl && seen.has(selfUrl)) verdicts.set(selfUrl, SELF_VERDICT);

  const toFetch = uniqueUrls.filter((url) => url !== selfUrl).slice(0, cfg.maxLinksToCheck);
  await runPool(toFetch, cfg.concurrency, async (url) => {
    const verdict = cfg.useCache
      ? await verdictCache.resolve(url, () => checkUrl(url, cfg), ttlFor)
      : await checkUrl(url, cfg);
    verdicts.set(url, verdict);
  });

  // Map back so every original <a> gets its own row. Nav and footer copies of a
  // broken link are reported separately because their link text differs and
  // that is what the person fixing it searches for.
  const brokenLinks: BrokenLinkInfo[] = [];
  const unverifiableLinks: UnverifiableLinkInfo[] = [];
  let validLinks = 0;
  let totalChecked = 0;

  normalized.forEach((entry, index) => {
    const { href, text } = links[index];
    if (entry.kind === 'invalid') {
      totalChecked += 1;
      brokenLinks.push({ href, text, status: 0, error: 'Invalid URL format' });
      return;
    }
    if (entry.kind === 'skip') {
      totalChecked += 1;
      validLinks += 1;
      return;
    }
    const verdict = verdicts.get(entry.url);
    if (!verdict) return; // Beyond maxLinksToCheck; not checked, not counted.
    totalChecked += 1;
    if (verdict.verdict === 'ok') {
      validLinks += 1;
    } else if (verdict.verdict === 'broken') {
      brokenLinks.push({ href, text, status: verdict.status, error: verdict.error });
    } else {
      unverifiableLinks.push({ href, text, status: verdict.status, reason: verdict.reason ?? 'bot-blocked' });
    }
  });

  return {
    totalChecked,
    totalLinks: links.length,
    uniqueUrls: uniqueUrls.length,
    brokenLinks,
    unverifiableLinks,
    validLinks,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
