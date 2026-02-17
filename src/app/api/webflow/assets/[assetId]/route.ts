import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

async function parseWebflowError(response: Response, fallback: string): Promise<string> {
  const errorText = await response.text();

  try {
    const errorJson = JSON.parse(errorText);
    return errorJson.message || errorJson.msg || fallback;
  } catch {
    return fallback;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  const apiToken = request.headers.get('x-webflow-token');

  if (!apiToken) {
    return NextResponse.json(
      { error: 'Missing API token in x-webflow-token header' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { localeId, displayName, altText } = body;

    const payload: Record<string, unknown> = {};
    if (localeId !== undefined) payload.localeId = localeId;
    if (displayName !== undefined) payload.displayName = displayName;
    if (altText !== undefined) payload.altText = altText;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No update fields provided' }, { status: 400 });
    }

    const response = await fetch(`${WEBFLOW_API_BASE}/assets/${assetId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorMessage = await parseWebflowError(
        response,
        'Failed to update asset in Webflow'
      );
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Webflow asset update API error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while updating asset' },
      { status: 500 }
    );
  }
}
