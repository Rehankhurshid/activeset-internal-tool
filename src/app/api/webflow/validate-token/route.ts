import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export async function POST(request: NextRequest) {
  try {
    const { apiToken, siteId } = await request.json();

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Missing apiToken in request body' },
        { status: 400 }
      );
    }

    if (!siteId) {
      return NextResponse.json(
        { error: 'Missing siteId in request body' },
        { status: 400 }
      );
    }

    // Test the token by fetching site info
    const response = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      const status = response.status;

      if (status === 401) {
        return NextResponse.json({
          valid: false,
          error: 'Invalid API token. Please check your token and try again.',
        });
      }

      if (status === 404) {
        return NextResponse.json({
          valid: false,
          error: 'Site not found. Please check your Site ID and try again.',
        });
      }

      if (status === 403) {
        return NextResponse.json({
          valid: false,
          error: 'Access denied. Your API token may not have the required permissions (pages:read, pages:write).',
        });
      }

      return NextResponse.json({
        valid: false,
        error: `Webflow API returned status ${status}. Please try again.`,
      });
    }

    const siteData = await response.json();

    return NextResponse.json({
      valid: true,
      siteName: siteData.displayName || siteData.shortName || siteData.name,
      siteId: siteData.id,
    });
  } catch (error) {
    console.error('Webflow validate token error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while validating credentials' },
      { status: 500 }
    );
  }
}
