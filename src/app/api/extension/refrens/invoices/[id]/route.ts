import { NextRequest, NextResponse } from 'next/server';
import {
  ExtensionAuthError,
  extensionAuthErrorResponse,
  requireExtensionToken,
} from '@/lib/extension-tokens';
import {
  getInvoiceRawForExtension,
  RefrensApiError,
  RefrensNotConfiguredError,
} from '@/services/RefrensService';

const SLUG = 'refrens-skydo-bridge';

/**
 * GET /api/extension/refrens/invoices/:id
 *
 * The full invoice document, which is where `share.link` lives — the extension
 * captures the real Refrens PDF from that view.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireExtensionToken(req, SLUG);
    const { id } = await params;
    return NextResponse.json(await getInvoiceRawForExtension(id));
  } catch (err) {
    if (err instanceof ExtensionAuthError) return extensionAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json({ error: 'Refrens is not configured on the server' }, { status: 503 });
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 400 ? 400 : 502 });
    }
    console.error('[api/extension/refrens/invoices/:id] failed:', err);
    return NextResponse.json({ error: 'Invoice lookup failed' }, { status: 500 });
  }
}
