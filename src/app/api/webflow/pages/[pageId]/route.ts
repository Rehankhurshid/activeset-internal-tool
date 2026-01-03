import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

// GET single page metadata
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const { searchParams } = new URL(request.url);
  const localeId = searchParams.get('localeId');
  const apiToken = request.headers.get('x-webflow-token');

  if (!apiToken) {
    return NextResponse.json(
      { error: 'Missing API token in x-webflow-token header' },
      { status: 400 }
    );
  }

  try {
    const url = new URL(`${WEBFLOW_API_BASE}/pages/${pageId}`);
    if (localeId) {
      url.searchParams.set('localeId', localeId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch page from Webflow';

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.msg || errorMessage;
      } catch {
        // Use default error message
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Webflow get page API error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching page' },
      { status: 500 }
    );
  }
}

// PUT update page SEO metadata
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const apiToken = request.headers.get('x-webflow-token');

  if (!apiToken) {
    return NextResponse.json(
      { error: 'Missing API token in x-webflow-token header' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { title, slug, seo, openGraph, localeId } = body;

    // Build the update payload with only provided fields
    const updatePayload: Record<string, unknown> = {};
    if (title !== undefined) updatePayload.title = title;
    // Slug updates are typically restricted on secondary locales or specific page types
    if (slug !== undefined) updatePayload.slug = slug;
    if (seo !== undefined) updatePayload.seo = seo;
    if (openGraph !== undefined) updatePayload.openGraph = openGraph;

    const url = new URL(`${WEBFLOW_API_BASE}/pages/${pageId}`);
    if (localeId) {
      url.searchParams.set('localeId', localeId);
    }

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to update page in Webflow';

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.msg || errorMessage;
      } catch {
        // Use default error message
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Webflow update page API error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while updating page' },
      { status: 500 }
    );
  }
}
