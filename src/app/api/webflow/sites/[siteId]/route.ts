import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ siteId: string }> }
) {
    const { siteId } = await params;
    const apiToken = request.headers.get('x-webflow-token');

    if (!apiToken) {
        return NextResponse.json(
            { error: 'Missing API token in x-webflow-token header' },
            { status: 400 }
        );
    }

    try {
        const response = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
                accept: 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Failed to fetch site details';

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
        console.error('Webflow site API error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred while fetching site details' },
            { status: 500 }
        );
    }
}
