import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { collectionId, apiToken, title, slug, body, excerpt } = await request.json();

    const token = apiToken || process.env.WEBFLOW_API_TOKEN;
    const collection = collectionId || process.env.WEBFLOW_COLLECTION_ID;

    if (!collection || !token) {
      return NextResponse.json(
        { error: 'Webflow collection ID and API token are required. Set WEBFLOW_API_TOKEN and WEBFLOW_COLLECTION_ID in .env.local or configure in Settings.' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.webflow.com/v2/collections/${collection}/items`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isArchived: false,
          isDraft: false,
          fieldData: {
            name: title,
            slug: slug,
            'post-html': body,
            'post-summary': excerpt,
          },
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.message || `Webflow API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Webflow publish error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Publish failed' },
      { status: 500 }
    );
  }
}
