import { NextRequest, NextResponse } from 'next/server';
import type { CmsCollectionSummary, CmsDiscoverResult, CollectionField } from '@/types/webflow';
import {
  WEBFLOW_API_BASE,
  buildHeaders,
  listCollections,
  getCollection,
} from '@/lib/cms/webflow-client';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

const IMAGE_FIELD_TYPES = new Set(['Image', 'MultiImage']);
const RICHTEXT_FIELD_TYPES = new Set(['RichText']);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId parameter' }, { status: 400 });
    }

    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    const collections = await listCollections(siteId, apiToken);
    const summaries: CmsCollectionSummary[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < collections.length; i += BATCH_SIZE) {
      const batch = collections.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async coll => {
          try {
            const schema = await getCollection(coll.id, apiToken);
            const fields: CollectionField[] = (schema.fields || []) as CollectionField[];
            const imageFields = fields.filter(f => IMAGE_FIELD_TYPES.has(f.type));
            const richTextFields = fields.filter(f => RICHTEXT_FIELD_TYPES.has(f.type));
            if (imageFields.length === 0 && richTextFields.length === 0) return null;

            // Get item count via limit=1 call (inline — shared client only exposes paged fetch)
            const itemsRes = await fetch(
              `${WEBFLOW_API_BASE}/collections/${coll.id}/items?limit=1&offset=0`,
              { headers: buildHeaders(apiToken) }
            );
            const itemsData = itemsRes.ok ? await itemsRes.json() : { pagination: { total: 0 } };
            const totalItems = itemsData.pagination?.total ?? 0;

            return {
              id: coll.id,
              displayName: schema.displayName || coll.displayName || coll.slug || 'Unknown',
              slug: schema.slug || coll.slug || '',
              singularName:
                (schema as unknown as { singularName?: string }).singularName ||
                schema.displayName ||
                '',
              imageFields,
              richTextFields,
              totalItems,
            } satisfies CmsCollectionSummary;
          } catch {
            return null;
          }
        })
      );

      for (const r of results) {
        if (r) summaries.push(r);
      }
    }

    const result: CmsDiscoverResult = {
      collections: summaries,
      totalImages: 0,
      totalMissingAlt: 0,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('CMS discover error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to discover CMS collections' },
      { status: 500 }
    );
  }
}
