import { NextRequest, NextResponse } from 'next/server';

import { checkWebsiteTextTarget, normalizeSearchText } from '@/lib/website-text-check';
import { WebsiteTextCheckResponse, WebsiteTextCheckTarget } from '@/types';

const MAX_QUERY_LENGTH = 300;
const MAX_TARGETS = 150;
const CONCURRENCY = 4;

interface RequestBody {
  query?: unknown;
  pages?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const rawQuery = typeof body.query === 'string' ? body.query : '';
    const normalizedQuery = normalizeSearchText(rawQuery);

    if (!normalizedQuery) {
      return NextResponse.json({ error: 'Search text is required.' }, { status: 400 });
    }

    if (normalizedQuery.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Search text must be ${MAX_QUERY_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }

    const targets = Array.isArray(body.pages) ? body.pages.filter(isWebsiteTextCheckTarget) : [];
    const uniqueTargets = dedupeTargets(targets).slice(0, MAX_TARGETS);

    if (uniqueTargets.length === 0) {
      return NextResponse.json({ error: 'At least one valid project URL is required.' }, { status: 400 });
    }

    const startedAt = Date.now();
    const results = await mapWithConcurrency(uniqueTargets, CONCURRENCY, (target) =>
      checkWebsiteTextTarget(target, normalizedQuery)
    );

    const matches = results
      .flatMap((result) => (result.match ? [result.match] : []))
      .sort((a, b) => b.occurrences - a.occurrences || a.title.localeCompare(b.title));

    const errors = results
      .flatMap((result) => (result.error ? [result.error] : []))
      .sort((a, b) => a.title.localeCompare(b.title));

    const response: WebsiteTextCheckResponse = {
      query: rawQuery,
      normalizedQuery,
      totalPages: uniqueTargets.length,
      scannedPages: uniqueTargets.length - errors.length,
      matchedPages: matches.length,
      durationMs: Date.now() - startedAt,
      matches,
      errors,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[project-text-check] Failed:', error);
    return NextResponse.json({ error: 'Failed to run website text check.' }, { status: 500 });
  }
}

function isWebsiteTextCheckTarget(value: unknown): value is WebsiteTextCheckTarget {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<WebsiteTextCheckTarget>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.url !== 'string'
  ) {
    return false;
  }

  try {
    const parsed = new URL(candidate.url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function dedupeTargets(targets: WebsiteTextCheckTarget[]): WebsiteTextCheckTarget[] {
  const seen = new Set<string>();
  const deduped: WebsiteTextCheckTarget[] = [];

  for (const target of targets) {
    const normalizedUrl = new URL(target.url).href;
    if (seen.has(normalizedUrl)) continue;

    seen.add(normalizedUrl);
    deduped.push({ ...target, url: normalizedUrl });
  }

  return deduped;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}
