import { NextRequest, NextResponse } from 'next/server';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

// GET page DOM content
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ pageId: string }> }
) {
    const { pageId } = await params;

    const resolved = await resolveWebflowToken(request);
    if (resolved instanceof NextResponse) return resolved;
    const { apiToken } = resolved;

    try {
        const response = await fetch(`${WEBFLOW_API_BASE}/pages/${pageId}/dom?limit=100`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
                accept: 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Failed to fetch page content from Webflow';

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
        console.error('Webflow get page content API error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred while fetching page content' },
            { status: 500 }
        );
    }
}
