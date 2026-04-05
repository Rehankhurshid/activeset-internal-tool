import { LinkInfo } from '@/types';

export interface BrokenLinkInfo {
  href: string;
  text: string;
  status: number;
  error?: string;
}

export interface BrokenLinkCheckSummary {
  totalChecked: number;
  totalLinks: number;
  brokenLinks: BrokenLinkInfo[];
  validLinks: number;
  checkedAt: string;
}

interface LinkCheckResult extends BrokenLinkInfo {
  isExternal: boolean;
}

interface LinkCheckOptions {
  maxLinksToCheck?: number;
  timeoutMs?: number;
  batchSize?: number;
}

const DEFAULT_OPTIONS: Required<LinkCheckOptions> = {
  maxLinksToCheck: 50,
  timeoutMs: 5000,
  batchSize: 10,
};

function isSkippableHref(href: string): boolean {
  return (
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:') ||
    href.startsWith('#')
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkSingleLink(
  link: Pick<LinkInfo, 'href' | 'text' | 'isExternal'>,
  pageUrl: string,
  timeoutMs: number
): Promise<LinkCheckResult> {
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(link.href, pageUrl).toString();
  } catch {
    return {
      href: link.href,
      text: link.text,
      status: 0,
      error: 'Invalid URL format',
      isExternal: link.isExternal,
    };
  }

  if (isSkippableHref(absoluteUrl)) {
    return {
      href: link.href,
      text: link.text,
      status: 200,
      isExternal: link.isExternal,
    };
  }

  const requestHeaders = {
    'User-Agent': 'ActiveSet-LinkChecker/1.0 (+https://activeset.co)',
  };

  try {
    const headResponse = await fetchWithTimeout(
      absoluteUrl,
      {
        method: 'HEAD',
        headers: requestHeaders,
        redirect: 'follow',
      },
      timeoutMs
    );

    // Some servers block HEAD requests; retry with GET in that case.
    if (headResponse.status === 405 || headResponse.status === 501) {
      const getResponse = await fetchWithTimeout(
        absoluteUrl,
        {
          method: 'GET',
          headers: requestHeaders,
          redirect: 'follow',
        },
        timeoutMs
      );

      return {
        href: link.href,
        text: link.text,
        status: getResponse.status,
        isExternal: link.isExternal,
      };
    }

    return {
      href: link.href,
      text: link.text,
      status: headResponse.status,
      isExternal: link.isExternal,
    };
  } catch (error) {
    // If HEAD fails for network reasons, try GET fallback.
    if (error instanceof Error && error.name !== 'AbortError') {
      try {
        const getResponse = await fetchWithTimeout(
          absoluteUrl,
          {
            method: 'GET',
            headers: requestHeaders,
            redirect: 'follow',
          },
          timeoutMs
        );

        return {
          href: link.href,
          text: link.text,
          status: getResponse.status,
          isExternal: link.isExternal,
        };
      } catch {
        // Continue to error result below.
      }
    }

    return {
      href: link.href,
      text: link.text,
      status: 0,
      error: error instanceof Error
        ? (error.name === 'AbortError' ? 'Timeout' : error.message)
        : 'Unknown error',
      isExternal: link.isExternal,
    };
  }
}

export async function checkBrokenLinks(
  links: Pick<LinkInfo, 'href' | 'text' | 'isExternal'>[],
  pageUrl: string,
  options?: LinkCheckOptions
): Promise<BrokenLinkCheckSummary> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const linksToCheck = links.slice(0, merged.maxLinksToCheck);
  const results: LinkCheckResult[] = [];

  for (let i = 0; i < linksToCheck.length; i += merged.batchSize) {
    const batch = linksToCheck.slice(i, i + merged.batchSize);
    const batchResults = await Promise.all(
      batch.map((link) => checkSingleLink(link, pageUrl, merged.timeoutMs))
    );
    results.push(...batchResults);
  }

  const brokenLinks = results
    .filter((result) => result.status === 0 || result.status >= 400)
    .map(({ href, text, status, error }) => ({ href, text, status, error }));

  const validLinks = results.filter((result) => result.status > 0 && result.status < 400).length;

  return {
    totalChecked: results.length,
    totalLinks: links.length,
    brokenLinks,
    validLinks,
    checkedAt: new Date().toISOString(),
  };
}
