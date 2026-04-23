import { NextRequest, NextResponse } from 'next/server';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    const body = await request.json();
    const { collectionId, itemIds } = body as { collectionId: string; itemIds: string[] };

    if (!collectionId || !Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: 'Missing collectionId or itemIds' }, { status: 400 });
    }

    const res = await fetch(`${WEBFLOW_API_BASE}/collections/${collectionId}/items/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ itemIds }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Failed to publish: ${text}` }, { status: res.status });
    }

    return NextResponse.json({ success: true, data: { publishedCount: itemIds.length } });
  } catch (error) {
    console.error('CMS publish error:', error);
    return NextResponse.json({ error: 'Failed to publish CMS items' }, { status: 500 });
  }
}
