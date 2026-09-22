import { NextRequest, NextResponse } from 'next/server';
import type { CollectionField } from '@/types/webflow';
import { getCollection, webflowFetch } from '@/lib/cms/webflow-client';
import { extractAllImages } from '@/lib/cms/extract';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

/**
 * What a collection's images look like on the *published* site.
 *
 * Reads Webflow's Content Delivery API (`api-cdn.webflow.com`), which serves
 * only published items, cached for up to five minutes, and does not count
 * against the rate limit once cached. That makes it useless for doing the
 * work — everything this tool writes is staged, so it would keep reading the
 * old values back — and exactly right for checking what visitors see.
 *
 * The Images screen compares this with the staged value on each row. On
 * 2026-09-22 a wrong name ("Priya Sharma, Head of Design") was saved, then
 * published from Webflow, and nothing on the screen said it had gone live.
 *
 * Returns, per CMS image entry id, the published ALT and URL. An entry that
 * is absent belongs to an item that has never been published.
 */
const CDN = 'https://api-cdn.webflow.com/v2';

export async function GET(request: NextRequest) {
  try {
    const collectionId = new URL(request.url).searchParams.get('collectionId');
    if (!collectionId) return NextResponse.json({ error: 'Missing collectionId parameter' }, { status: 400 });

    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    const schema = await getCollection(collectionId, apiToken);
    const fields = (schema.fields || []) as CollectionField[];
    const name = schema.displayName || schema.slug || 'Unknown';

    const entries: Record<string, { alt: string; url: string }> = {};
    let cacheHits = 0;
    let pages = 0;
    for (let offset = 0; offset < 20_000; offset += 100) {
      const res = await webflowFetch(`${CDN}/collections/${collectionId}/items/live?limit=100&offset=${offset}`, apiToken);
      // A collection with nothing published answers 404; that is an answer.
      if (res.status === 404) break;
      if (!res.ok) throw new Error(`Webflow refused the published items (${res.status})`);
      pages += 1;
      if (res.headers.get('cf-cache-status') === 'HIT') cacheHits += 1;
      const body = (await res.json()) as { items?: unknown[]; pagination?: { total?: number } };
      const items = body.items ?? [];
      for (const item of items) {
        for (const image of extractAllImages(item as never, collectionId, name, fields)) {
          entries[image.id] = { alt: image.currentAlt ?? '', url: image.imageUrl };
        }
      }
      if (items.length < 100 || offset + items.length >= (body.pagination?.total ?? 0)) break;
    }

    return NextResponse.json({
      success: true,
      data: { entries, fetchedAt: new Date().toISOString(), fromCache: pages > 0 && cacheHits === pages },
    });
  } catch (error) {
    console.error('CMS live API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read published items' },
      { status: 500 },
    );
  }
}
