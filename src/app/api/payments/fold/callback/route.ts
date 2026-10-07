import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/base-url';
import {
  completeFoldConnect,
  fetchFoldAccounts,
  updateFoldSettings,
} from '@/modules/payments/infrastructure/fold.client';

export const runtime = 'nodejs';

/**
 * GET /api/payments/fold/callback?code&state: Fold's OAuth redirect.
 *
 * No Firebase auth here (it is a browser redirect). It is safe because the
 * `state` must equal the one an admin created with /connect in the last 15
 * minutes, and the PKCE verifier never left the server.
 */
export async function GET(req: NextRequest) {
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${getBaseUrl()}/modules/payments?${new URLSearchParams(params)}`);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) return back({ fold: 'error', reason: oauthError });
  if (!code || !state) return back({ fold: 'error', reason: 'missing code' });

  try {
    await completeFoldConnect(code, state);
  } catch (err) {
    console.error('[api/payments/fold/callback] connect failed:', err);
    return back({ fold: 'error', reason: err instanceof Error ? err.message : 'connect failed' });
  }

  try {
    await updateFoldSettings({ accounts: await fetchFoldAccounts() });
  } catch (err) {
    // Connected anyway; the first sync refreshes the account list.
    console.error('[api/payments/fold/callback] could not list accounts:', err);
  }
  return back({ fold: 'connected' });
}
