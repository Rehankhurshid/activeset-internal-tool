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

/**
 * POST /api/webflow/sites/:siteId
 * Body:
 * {
 *   action: "publish" | "unpublish",
 *   customDomains?: string[],
 *   publishToWebflowSubdomain?: boolean
 * }
 *
 * Webflow does not currently expose a dedicated "unpublish site" endpoint in v2.
 * "unpublish" here is treated as: publish with no targets unless caller overrides.
 */
export async function POST(
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
        const body = await request.json();
        const action = typeof body?.action === 'string' ? body.action : 'publish';
        const customDomainsInput = Array.isArray(body?.customDomains)
            ? body.customDomains.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
            : undefined;

        if (action === 'unpublish') {
            return NextResponse.json(
                {
                    error:
                        'Webflow Data API does not expose a dedicated site-wide unpublish endpoint. Use page draft/archive controls for content-level unpublishing.',
                },
                { status: 400 }
            );
        }

        let publishToWebflowSubdomain =
            typeof body?.publishToWebflowSubdomain === 'boolean'
                ? body.publishToWebflowSubdomain
                : true;

        let customDomains = customDomainsInput;
        if (customDomains === undefined) {
            const domainsResponse = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/custom_domains`, {
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    accept: 'application/json',
                },
            });

            if (domainsResponse.ok) {
                const domainsData = await domainsResponse.json();
                const ids = Array.isArray(domainsData?.customDomains)
                    ? domainsData.customDomains
                          .map((domain: { id?: unknown }) => (typeof domain?.id === 'string' ? domain.id : null))
                          .filter((id: string | null): id is string => !!id)
                    : [];
                if (ids.length > 0) {
                    customDomains = ids;
                }
            }
        }

        const payload: Record<string, unknown> = {
            publishToWebflowSubdomain,
        };

        if (customDomains !== undefined && customDomains.length > 0) {
            payload.customDomains = customDomains;
        }

        const response = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/publish`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiToken}`,
                accept: 'application/json',
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorMessage = await parseWebflowError(response, 'Failed to publish site');
            return NextResponse.json({ error: errorMessage }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json({
            success: true,
            action,
            payload,
            data,
        });
    } catch (error) {
        console.error('Webflow site publish API error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred while updating site publish state' },
            { status: 500 }
        );
    }
}
