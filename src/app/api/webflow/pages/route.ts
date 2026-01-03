import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const apiToken = request.headers.get('x-webflow-token');
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';

    if (!siteId) {
      return NextResponse.json(
        { error: 'Missing siteId parameter' },
        { status: 400 }
      );
    }

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Missing API token in x-webflow-token header' },
        { status: 400 }
      );
    }

    const localeId = searchParams.get('localeId');

    const url = new URL(`${WEBFLOW_API_BASE}/sites/${siteId}/pages`);
    url.searchParams.set('limit', limit);
    url.searchParams.set('offset', offset);
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
      let errorMessage = 'Failed to fetch pages from Webflow';

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
    console.error('Webflow pages API error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching pages' },
      { status: 500 }
    );
  }
}
