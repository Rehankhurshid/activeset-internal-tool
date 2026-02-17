import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

function buildWebflowHeaders(apiToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiToken}`,
    accept: 'application/json',
  };
}

async function parseWebflowError(response: Response, fallback: string): Promise<string> {
  const errorText = await response.text();

  try {
    const errorJson = JSON.parse(errorText);
    return errorJson.message || errorJson.msg || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const apiToken = request.headers.get('x-webflow-token');
    const folderId = searchParams.get('folderId');
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';
    const imagesOnly = searchParams.get('imagesOnly') !== 'false';

    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId parameter' }, { status: 400 });
    }

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Missing API token in x-webflow-token header' },
        { status: 400 }
      );
    }

    const assetsUrl = new URL(`${WEBFLOW_API_BASE}/sites/${siteId}/assets`);
    assetsUrl.searchParams.set('limit', limit);
    assetsUrl.searchParams.set('offset', offset);

    const foldersUrl = new URL(`${WEBFLOW_API_BASE}/sites/${siteId}/asset_folders`);

    const [assetsResponse, foldersResponse] = await Promise.all([
      fetch(assetsUrl.toString(), { headers: buildWebflowHeaders(apiToken) }),
      fetch(foldersUrl.toString(), { headers: buildWebflowHeaders(apiToken) }),
    ]);

    if (!assetsResponse.ok) {
      const errorMessage = await parseWebflowError(
        assetsResponse,
        'Failed to fetch assets from Webflow'
      );
      return NextResponse.json({ error: errorMessage }, { status: assetsResponse.status });
    }

    if (!foldersResponse.ok) {
      const errorMessage = await parseWebflowError(
        foldersResponse,
        'Failed to fetch asset folders from Webflow'
      );
      return NextResponse.json({ error: errorMessage }, { status: foldersResponse.status });
    }

    const assetsData = await assetsResponse.json();
    const foldersData = await foldersResponse.json();

    let assets = Array.isArray(assetsData.assets) ? assetsData.assets : [];
    const folders = Array.isArray(foldersData.assetFolders) ? foldersData.assetFolders : [];

    if (imagesOnly) {
      assets = assets.filter(
        (asset: { contentType?: string }) =>
          typeof asset.contentType === 'string' && asset.contentType.startsWith('image/')
      );
    }

    if (folderId && folderId !== 'all') {
      const folder = folders.find((entry: { id: string }) => entry.id === folderId);
      const folderAssetIds = new Set<string>(folder?.assets || []);
      assets = assets.filter((asset: { id: string }) => folderAssetIds.has(asset.id));
    }

    return NextResponse.json({
      success: true,
      data: {
        assets,
        folders,
        pagination: assetsData.pagination,
      },
    });
  } catch (error) {
    console.error('Webflow assets API error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching assets' },
      { status: 500 }
    );
  }
}
