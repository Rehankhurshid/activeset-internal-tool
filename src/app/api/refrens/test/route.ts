import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin } from '@/lib/api-auth';
import {
  RefrensApiError,
  RefrensNotConfiguredError,
  listInvoices,
} from '@/services/RefrensService';

export const runtime = 'nodejs';

/**
 * GET /api/refrens/test
 * Admin-only. Round-trips the stored credentials by listing one invoice from
 * Refrens. Returns a small sample so we can confirm the urlKey/JWT pair is
 * valid before we wire up the full invoice tab.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const result = await listInvoices({ limit: 1 });
    const sample = result.items[0];
    return NextResponse.json({
      ok: true,
      total: result.total,
      sample: sample
        ? {
            invoiceNumber: sample.invoiceNumber ?? null,
            status: sample.status ?? null,
            createdAt: sample.createdAt ?? null,
          }
        : null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof RefrensNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: 'Refrens credentials are not configured' },
        { status: 400 }
      );
    }
    if (err instanceof RefrensApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          status: err.status,
          body: err.body,
        },
        { status: 502 }
      );
    }
    console.error('[api/refrens/test GET] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
