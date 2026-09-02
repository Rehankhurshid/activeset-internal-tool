import { NextRequest, NextResponse } from 'next/server';
import {
  ExtensionAuthError,
  extensionAuthErrorResponse,
  requireExtensionToken,
} from '@/lib/extension-tokens';
import {
  queryInvoicesForExtension,
  RefrensApiError,
  RefrensNotConfiguredError,
} from '@/services/RefrensService';

const SLUG = 'refrens-skydo-bridge';

/**
 * GET /api/extension/refrens/invoices?<allowlisted feathers query>
 *
 * The extension's read path. It keeps its own query logic — the amount-range,
 * outstanding and payer-name probes — and this forwards the allowlisted subset
 * with the server's Refrens credentials. The signing key never leaves the server.
 */
export async function GET(req: NextRequest) {
  try {
    await requireExtensionToken(req, SLUG);
    const data = await queryInvoicesForExtension(new URL(req.url).searchParams);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ExtensionAuthError) return extensionAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json({ error: 'Refrens is not configured on the server' }, { status: 503 });
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('[api/extension/refrens/invoices] failed:', err);
    return NextResponse.json({ error: 'Invoice query failed' }, { status: 500 });
  }
}
