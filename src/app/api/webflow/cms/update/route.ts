import { NextRequest, NextResponse } from 'next/server';
import type { CmsUpdatePayload } from '@/types/webflow';
import { patchItems } from '@/lib/cms/webflow-client';
import { groupUpdatesByItem } from '@/lib/cms/patch';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    const body = await request.json();
    const updates: CmsUpdatePayload[] = body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const grouped = groupUpdatesByItem(updates);

    const byCollection = new Map<string, Array<{ id: string; fieldData: Record<string, unknown> }>>();
    for (const entry of grouped.values()) {
      const items = byCollection.get(entry.collectionId) || [];
      items.push({ id: entry.itemId, fieldData: entry.fieldData });
      byCollection.set(entry.collectionId, items);
    }

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [collectionId, items] of byCollection) {
      const hasRichText = updates.some(
        u => u.collectionId === collectionId && u.fieldType === 'RichText'
      );
      const batchSize = hasRichText ? 1 : 5;

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const res = await patchItems(collectionId, apiToken, batch);
        if (res.ok) {
          updated += batch.length;
        } else {
          failed += batch.length;
          errors.push(`Collection ${collectionId}: ${res.text}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { updated, failed, errors },
    });
  } catch (error) {
    console.error('CMS update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update CMS items' },
      { status: 500 }
    );
  }
}
