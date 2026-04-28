import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  deleteRefrensCredentials,
  getRefrensConfigStatus,
  setRefrensCredentials,
} from '@/services/appSecrets';
import { invalidateRefrensJwtCache, invalidateInvoiceListCache } from '@/services/RefrensService';

export const runtime = 'nodejs';

interface SaveBody {
  urlKey?: string;
  appId?: string;
  privateKey?: string;
}

/**
 * GET /api/refrens/config
 * Admin-only. Returns whether Refrens credentials are configured plus the
 * non-secret urlKey. Never returns the JWT.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const status = await getRefrensConfigStatus();
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/config GET] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/refrens/config
 * Admin-only. Saves the Refrens credentials (urlKey + appId + EC private key)
 * into the server-only `app_secrets/refrens` doc. The private key is used to
 * sign short-lived ES256 JWTs on demand inside RefrensService.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as SaveBody;
    const urlKey = body.urlKey?.trim();
    const appId = body.appId?.trim();
    const privateKey = body.privateKey?.trim();
    if (!urlKey || !appId || !privateKey) {
      return NextResponse.json(
        { error: 'urlKey, appId and privateKey are required' },
        { status: 400 }
      );
    }
    if (!privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) {
      return NextResponse.json(
        { error: 'privateKey must be a PEM-formatted EC private key' },
        { status: 400 }
      );
    }
    await setRefrensCredentials({ urlKey, appId, privateKey });
    invalidateRefrensJwtCache();
    invalidateInvoiceListCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/config POST] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/refrens/config
 * Admin-only. Removes the stored Refrens credentials.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    await deleteRefrensCredentials();
    invalidateRefrensJwtCache();
    invalidateInvoiceListCache();
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/refrens/config DELETE] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
