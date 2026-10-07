import 'server-only';
import { NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse } from '@/lib/api-auth';
import { FoldNotConnectedError, FoldReconnectRequiredError } from './fold.client';

/** One error shape for every /api/payments route. */
export function paymentsErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
  if (err instanceof FoldNotConnectedError || err instanceof FoldReconnectRequiredError) {
    return NextResponse.json({ error: err.message, needsReconnect: true }, { status: 409 });
  }
  console.error(`[${where}] error:`, err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
}
