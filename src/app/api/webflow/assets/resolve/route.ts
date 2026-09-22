import { NextRequest, NextResponse } from 'next/server';
import { resolveWebflowToken } from '@/lib/webflow-token-resolver';
import {
  resolveAssets,
  type WebflowAssetSummary,
} from '@/modules/site-monitoring/domain/webflow-assets';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';
const PAGE_SIZE = 100;

/**
 * Which of these image URLs can actually have their alt text written?
 *
 * The Audit tab used to decide that by reading the 24-hex prefix out of the
 * URL and calling it an asset id. It is not one: Webflow re-encodes images for
 * delivery under fresh ids, and CMS images never appear in the site asset list
 * at all. The result was a Save button that always failed with "Asset not
 * found". The only way to know is to ask, so this asks.
 *
 * POST { siteId, srcs: string[] } -> { resolved: { [src]: assetId }, assetCount }
 */
export async function POST(request: NextRequest) {
  const resolved = await resolveWebflowToken(request);
  if (resolved instanceof NextResponse) return resolved;
  const { apiToken } = resolved;

  try {
    const { siteId, srcs } = (await request.json()) as { siteId?: string; srcs?: string[] };
    if (!siteId) return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });
    if (!Array.isArray(srcs) || srcs.length === 0) {
      return NextResponse.json({ resolved: {}, assetCount: 0 });
    }

    // The list is paginated and a busy site runs to several hundred; the whole
    // list is needed because any one image could be anywhere in it.
    const assets: WebflowAssetSummary[] = [];
    for (let offset = 0; offset < 2000; offset += PAGE_SIZE) {
      const res = await fetch(
        `${WEBFLOW_API_BASE}/sites/${siteId}/assets?limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${apiToken}`, accept: 'application/json' } },
      );
      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json(
          { error: `Webflow refused the asset list (${res.status}): ${detail.slice(0, 200)}` },
          { status: res.status },
        );
      }
      const page = (await res.json()) as { assets?: WebflowAssetSummary[]; pagination?: { total?: number } };
      assets.push(...(page.assets ?? []));
      if (assets.length >= (page.pagination?.total ?? assets.length)) break;
      if ((page.assets?.length ?? 0) < PAGE_SIZE) break;
    }

    return NextResponse.json({
      resolved: resolveAssets(srcs.slice(0, 500), assets),
      assetCount: assets.length,
    });
  } catch (error) {
    console.error('[webflow/assets/resolve] failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
