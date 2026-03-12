import { WebsiteTextCheckError, WebsiteTextCheckMatch, WebsiteTextCheckTarget } from '@/types';

const STRIP_BLOCKS_PATTERN = /<(head|script|style|noscript|svg|canvas|iframe|template)[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_COMMENTS_PATTERN = /<!--[\s\S]*?-->/g;
const BLOCK_BREAK_PATTERN = /<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;
const STRIP_TAGS_PATTERN = /<[^>]+>/g;
const ENTITY_PATTERN = /&(#x?[0-9a-f]+|[a-z]+);/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const DEFAULT_MAX_BYTES = 400_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_SNIPPET_LIMIT = 3;
const DEFAULT_SNIPPET_RADIUS = 80;

export function normalizeSearchText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
}

export function extractSearchableTextFromHtml(html: string): string {
  const withoutHeavyBlocks = html
    .replace(STRIP_COMMENTS_PATTERN, ' ')
    .replace(STRIP_BLOCKS_PATTERN, ' ')
    .replace(BLOCK_BREAK_PATTERN, ' ');

  const withoutTags = withoutHeavyBlocks.replace(STRIP_TAGS_PATTERN, ' ');
  return normalizeSearchText(withoutTags);
}

export function extractTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return undefined;

  const title = normalizeSearchText(match[1]);
  return title || undefined;
}

export function findTextMatchSummary(
  text: string,
  rawQuery: string,
  options?: {
    snippetLimit?: number;
    snippetRadius?: number;
  }
): Pick<WebsiteTextCheckMatch, 'occurrences' | 'snippets'> {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(rawQuery).toLowerCase();

  if (!normalizedText || !normalizedQuery) {
    return { occurrences: 0, snippets: [] };
  }

  const haystack = normalizedText.toLowerCase();
  const snippets: string[] = [];
  const snippetLimit = options?.snippetLimit ?? DEFAULT_SNIPPET_LIMIT;
  const snippetRadius = options?.snippetRadius ?? DEFAULT_SNIPPET_RADIUS;
  let cursor = 0;
  let occurrences = 0;

  while (cursor < haystack.length) {
    const index = haystack.indexOf(normalizedQuery, cursor);
    if (index === -1) break;

    occurrences += 1;

    if (snippets.length < snippetLimit) {
      const start = Math.max(0, index - snippetRadius);
      const end = Math.min(normalizedText.length, index + normalizedQuery.length + snippetRadius);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < normalizedText.length ? '...' : '';
      snippets.push(`${prefix}${normalizedText.slice(start, end).trim()}${suffix}`);
    }

    cursor = index + normalizedQuery.length;
  }

  return { occurrences, snippets };
}

export async function checkWebsiteTextTarget(
  target: WebsiteTextCheckTarget,
  rawQuery: string,
  options?: {
    maxBytes?: number;
    timeoutMs?: number;
  }
): Promise<{ match?: WebsiteTextCheckMatch; error?: WebsiteTextCheckError }> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ActiveSet-Website-Text-Checker/1.0 (+https://activeset.co)',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        error: {
          id: target.id,
          title: target.title,
          url: target.url,
          message: `Request failed with status ${response.status}`,
        },
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return {
        error: {
          id: target.id,
          title: target.title,
          url: target.url,
          message: 'Page did not return HTML content',
        },
      };
    }

    const html = await readResponseText(response, maxBytes);
    const searchableText = extractSearchableTextFromHtml(html);
    const { occurrences, snippets } = findTextMatchSummary(searchableText, rawQuery);

    if (occurrences === 0) {
      return {};
    }

    return {
      match: {
        id: target.id,
        title: target.title,
        url: target.url,
        occurrences,
        snippets,
        titleTag: extractTitleTag(html),
      },
    };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? `Timed out after ${timeoutMs / 1000}s`
        : error instanceof Error
          ? error.message
          : 'Unknown error';

    return {
      error: {
        id: target.id,
        title: target.title,
        url: target.url,
        message,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      const allowedBytes = value.byteLength - (totalBytes - maxBytes);
      if (allowedBytes > 0) {
        text += decoder.decode(value.subarray(0, allowedBytes), { stream: true });
      }
      await reader.cancel();
      break;
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(ENTITY_PATTERN, (_, entity: string) => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity in NAMED_ENTITIES) {
      return NAMED_ENTITIES[normalizedEntity];
    }

    if (normalizedEntity.startsWith('#x')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    if (normalizedEntity.startsWith('#')) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    return _;
  });
}

function isValidCodePoint(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
}
