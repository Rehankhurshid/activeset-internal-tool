import { NextRequest, NextResponse } from 'next/server';
import type { CmsImageEntry, CmsItemsResult, CollectionField } from '@/types/webflow';
import { getCollection, listItems } from '@/lib/cms/webflow-client';
import { extractAllImages } from '@/lib/cms/extract';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collectionId');
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    if (!collectionId) {
      return NextResponse.json({ error: 'Missing collectionId parameter' }, { status: 400 });
    }

    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    const schema = await getCollection(collectionId, apiToken);
    const allFields: CollectionField[] = (schema.fields || []) as CollectionField[];
    const collectionName = schema.displayName || schema.slug || 'Unknown';

    const hasAny = allFields.some(
      f => f.type === 'Image' || f.type === 'MultiImage' || f.type === 'RichText'
    );
    if (!hasAny) {
      return NextResponse.json({
        success: true,
        data: { images: [], hasMore: false, nextOffset: 0, total: 0 } satisfies CmsItemsResult,
      });
    }

    const { items, pagination } = await listItems(collectionId, apiToken, offset, limit);
    const total = pagination.total ?? 0;

    const allImages: CmsImageEntry[] = [];
    for (const item of items) {
      allImages.push(...extractAllImages(item, collectionId, collectionName, allFields));
    }

    const nextOffset = offset + items.length;
    const result: CmsItemsResult = {
      images: allImages,
      hasMore: nextOffset < total,
      nextOffset,
      total,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('CMS items API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch CMS items' },
      { status: 500 }
    );
  }
}
