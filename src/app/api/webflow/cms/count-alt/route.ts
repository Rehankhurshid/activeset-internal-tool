import { NextRequest, NextResponse } from 'next/server';
import type {
  CmsAltScanCollectionResult,
  CollectionField,
} from '@/types/webflow';
import { getCollection, listItems } from '@/lib/cms/webflow-client';
import { extractAllImages } from '@/lib/cms/extract';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

/**
 * Count CMS images with/without ALT text for a single collection.
 * Walks every item in the collection (paginated) and aggregates counts
 * without returning the full image list — much cheaper for the UI to
 * render a "N missing ALT" stat than loading all images client-side.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collectionId');

    if (!collectionId) {
      return NextResponse.json({ error: 'Missing collectionId parameter' }, { status: 400 });
    }

    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    const schema = await getCollection(collectionId, apiToken);
    const allFields: CollectionField[] = (schema.fields || []) as CollectionField[];
    const collectionName = schema.displayName || schema.slug || 'Unknown';

    const hasImageLikeField = allFields.some(
      (f) => f.type === 'Image' || f.type === 'MultiImage' || f.type === 'RichText'
    );

    if (!hasImageLikeField) {
      const result: CmsAltScanCollectionResult = {
        collectionId,
        totalImages: 0,
        missingAltCount: 0,
        scannedAt: new Date().toISOString(),
      };
      return NextResponse.json({ success: true, data: result });
    }

    let totalImages = 0;
    let missingAltCount = 0;
    let offset = 0;
    const limit = 100;
    let more = true;

    // Walk all items. Webflow enforces rate limits at the platform layer —
    // keeping this sequential stays well under typical 60 req/min limits
    // for most collections.
    while (more) {
      const { items, pagination } = await listItems(collectionId, apiToken, offset, limit);
      for (const item of items) {
        const entries = extractAllImages(item, collectionId, collectionName, allFields);
        for (const entry of entries) {
          totalImages += 1;
          if (entry.isMissingAlt) missingAltCount += 1;
        }
      }

      const total = pagination.total ?? 0;
      offset += items.length;
      more = items.length > 0 && offset < total;
    }

    const result: CmsAltScanCollectionResult = {
      collectionId,
      totalImages,
      missingAltCount,
      scannedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('CMS count-alt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to count CMS ALT text' },
      { status: 500 }
    );
  }
}
