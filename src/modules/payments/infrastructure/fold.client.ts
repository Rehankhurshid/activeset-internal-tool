import 'server-only';
import crypto from 'node:crypto';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import {
  DEFAULT_MIN_AMOUNT,
  type FoldAccountSummary,
  type FoldConnectionStatus,
  type FoldSyncSummary,
} from '@/modules/payments/domain/payments.types';

/**
 * Fold (fold.money) over its remote MCP server, as an OAuth client.
 *
 * - OAuth 2.1 with dynamic client registration and PKCE; public client, no secret.
 * - Access tokens last 15 minutes. Refresh tokens ROTATE and Fold detects
 *   reuse: presenting an old refresh token revokes the whole grant, and the
 *   only fix is to reconnect. So refreshing is serialised with a Firestore
 *   lease (`refreshLockUntil`), and the new refresh token is saved before the
 *   access token is used.
 * - The grant can write and delete transactions even though the scope reads
 *   "mcp:read". This client calls only the tools in READ_ONLY_TOOLS and
 *   refuses anything else.
 *
 * State lives in `app_secrets/fold` (tokens, accounts, settings) and
 * `app_secrets/fold_pending` (one in-flight connect). Both are server-only.
 */

const FOLD_BASE = 'https://mcp.fold.money';
const FOLD_MCP_URL = `${FOLD_BASE}/mcp`;
const SCOPE = 'mcp:read offline_access';
const FOLD_DOC = 'fold';
const PENDING_DOC = 'fold_pending';
const PENDING_TTL_MS = 15 * 60 * 1000;
const REFRESH_LEASE_MS = 30 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

export const READ_ONLY_TOOLS = ['list_bank_accounts', 'list_transactions'] as const;
export type FoldReadTool = (typeof READ_ONLY_TOOLS)[number];

export const DEFAULT_NOTIFY_EMAILS = ['salman@activeset.co', 'rehan@activeset.co'];

export class FoldNotConnectedError extends Error {
  constructor(message = 'Fold is not connected') {
    super(message);
  }
}

export class FoldReconnectRequiredError extends Error {
  constructor(message = 'Fold sign-in expired. Reconnect Fold.') {
    super(message);
  }
}

interface FoldDoc {
  clientId?: string;
  redirectUri?: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  accessTokenExpiresAt?: number;
  refreshLockUntil?: number;
  needsReconnect?: boolean;
  lastError?: string | null;
  connectedBy?: string;
  connectedAt?: string;
  accounts?: FoldAccountSummary[];
  selectedAccountIds?: string[];
  minAmount?: number;
  notifyEmails?: string[];
  lastSync?: FoldSyncSummary | null;
  lastSuccessfulSyncAt?: string | null;
}

interface PendingDoc {
  state: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  createdBy: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function secrets() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error('[fold] firebase-admin credentials are not configured; cannot access app_secrets');
  }
  return adminDb.collection(COLLECTIONS.APP_SECRETS);
}

const foldRef = () => secrets().doc(FOLD_DOC);
const pendingRef = () => secrets().doc(PENDING_DOC);

const b64url = (buf: Buffer) => buf.toString('base64url');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readFoldDoc(): Promise<FoldDoc | null> {
  const snap = await foldRef().get();
  return snap.exists ? ((snap.data() as FoldDoc) ?? null) : null;
}

// ---------------------------------------------------------------------------
// Connect (authorize → callback)
// ---------------------------------------------------------------------------

/** Registers a client for this redirect URI and returns the Fold sign-in URL. */
export async function startFoldConnect(redirectUri: string, createdBy: string): Promise<string> {
  const reg = await fetch(`${FOLD_BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ActiveSet internal tool',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  const regBody = (await reg.json().catch(() => ({}))) as { client_id?: string };
  if (!reg.ok || !regBody.client_id) {
    throw new Error(`Fold client registration failed (${reg.status})`);
  }

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  const pending: PendingDoc = {
    state,
    verifier,
    clientId: regBody.client_id,
    redirectUri,
    createdBy,
    expiresAt: Date.now() + PENDING_TTL_MS,
  };
  await pendingRef().set(pending);

  const url = new URL(`${FOLD_BASE}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', regBody.client_id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('resource', FOLD_BASE);
  return url.toString();
}

/** Exchanges the callback code for tokens. Keeps account picks and settings from an earlier connection. */
export async function completeFoldConnect(code: string, state: string): Promise<void> {
  const snap = await pendingRef().get();
  const pending = snap.exists ? (snap.data() as PendingDoc) : null;
  if (!pending || pending.state !== state) throw new Error('This Fold sign-in link is not the latest one. Start again.');
  if (pending.expiresAt < Date.now()) throw new Error('The Fold sign-in took too long. Start again.');
  await pendingRef().delete();

  const res = await fetch(`${FOLD_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      resource: FOLD_BASE,
    }),
  });
  const tok = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !tok.access_token || !tok.refresh_token) {
    throw new Error(`Fold token exchange failed (${tok.error ?? res.status})`);
  }

  await foldRef().set(
    {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      refreshToken: tok.refresh_token,
      accessToken: tok.access_token,
      accessTokenExpiresAt: Date.now() + (tok.expires_in ?? 900) * 1000,
      refreshLockUntil: 0,
      needsReconnect: false,
      lastError: null,
      connectedBy: pending.createdBy,
      connectedAt: new Date().toISOString(),
    } satisfies FoldDoc,
    { merge: true }
  );
}

/** Revokes the grant at Fold (best effort) and forgets the tokens. Keeps synced payments. */
export async function disconnectFold(): Promise<void> {
  const doc = await readFoldDoc();
  if (doc?.refreshToken && doc.clientId) {
    await fetch(`${FOLD_BASE}/oauth/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: doc.refreshToken, token_type_hint: 'refresh_token', client_id: doc.clientId }),
    }).catch(() => undefined);
  }
  await foldRef().set(
    { refreshToken: null, accessToken: null, accessTokenExpiresAt: 0, refreshLockUntil: 0, needsReconnect: false },
    { merge: true }
  );
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type LeaseResult =
  | { kind: 'ready'; accessToken: string }
  | { kind: 'busy' }
  | { kind: 'lease'; refreshToken: string; clientId: string };

/**
 * A valid access token, refreshing at most once across every caller. If
 * another request holds the refresh lease, waits for it to finish.
 */
async function getAccessToken(forceRefresh = false): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const lease = await adminDb.runTransaction<LeaseResult>(async (tx) => {
      const snap = await tx.get(foldRef());
      const d = (snap.data() as FoldDoc | undefined) ?? {};
      if (!d.refreshToken || !d.clientId) throw new FoldNotConnectedError();
      if (d.needsReconnect) throw new FoldReconnectRequiredError();
      const now = Date.now();
      if (!forceRefresh && d.accessToken && (d.accessTokenExpiresAt ?? 0) > now + EXPIRY_MARGIN_MS) {
        return { kind: 'ready', accessToken: d.accessToken };
      }
      if ((d.refreshLockUntil ?? 0) > now) return { kind: 'busy' };
      tx.update(foldRef(), { refreshLockUntil: now + REFRESH_LEASE_MS });
      return { kind: 'lease', refreshToken: d.refreshToken, clientId: d.clientId };
    });

    if (lease.kind === 'ready') return lease.accessToken;
    if (lease.kind === 'busy') {
      forceRefresh = false; // whoever holds the lease is refreshing for us
      await sleep(1500);
      continue;
    }

    const res = await fetch(`${FOLD_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: lease.refreshToken,
        client_id: lease.clientId,
        resource: FOLD_BASE,
      }),
    }).catch((err: unknown) => err as Error);

    if (res instanceof Error) {
      await foldRef().update({ refreshLockUntil: 0, lastError: `Fold unreachable: ${res.message}` });
      throw res;
    }
    const tok = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !tok.access_token) {
      const grantDead = tok.error === 'invalid_grant' || res.status === 401;
      await foldRef().update({
        refreshLockUntil: 0,
        needsReconnect: grantDead,
        lastError: `Fold token refresh failed (${tok.error ?? res.status})`,
      });
      if (grantDead) throw new FoldReconnectRequiredError();
      throw new Error(`Fold token refresh failed (${res.status})`);
    }

    // Save the rotated refresh token first: the old one is already dead.
    await foldRef().update({
      refreshToken: tok.refresh_token ?? lease.refreshToken,
      accessToken: tok.access_token,
      accessTokenExpiresAt: Date.now() + (tok.expires_in ?? 900) * 1000,
      refreshLockUntil: 0,
      lastError: null,
    });
    return tok.access_token;
  }
  throw new Error('Timed out waiting for another Fold token refresh');
}

// ---------------------------------------------------------------------------
// MCP calls
// ---------------------------------------------------------------------------

class FoldHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * One MCP conversation with Fold: initialize once, then call read-only tools.
 * Fold's server is stateless (no session id), so this is cheap to create.
 */
export class FoldSession {
  private token: string | null = null;
  private initialized = false;
  private nextId = 1;
  private sessionId: string | null = null;

  private async post(body: Record<string, unknown>): Promise<unknown> {
    if (!this.token) this.token = await getAccessToken();
    const send = async () => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${this.token}`,
      };
      if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
      return fetch(FOLD_MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    };
    let res = await send();
    if (res.status === 401) {
      this.token = await getAccessToken(true);
      res = await send();
    }
    this.sessionId = res.headers.get('mcp-session-id') ?? this.sessionId;
    const text = await res.text();
    if (!res.ok) throw new FoldHttpError(res.status, `Fold MCP ${res.status}: ${text.slice(0, 200)}`);
    if (!('id' in body)) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      const data = text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .filter(Boolean);
      return data.length ? JSON.parse(data[data.length - 1]) : null;
    }
    return text ? JSON.parse(text) : null;
  }

  private async rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const msg = (await this.post({ jsonrpc: '2.0', id: this.nextId++, method, ...(params ? { params } : {}) })) as {
      result?: unknown;
      error?: { message?: string };
    } | null;
    if (!msg) throw new Error(`Fold MCP returned nothing for ${method}`);
    if (msg.error) throw new Error(`Fold MCP ${method}: ${msg.error.message ?? 'error'}`);
    return msg.result;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'activeset-internal-tool', version: '1' },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.initialized = true;
  }

  async callTool<T>(name: FoldReadTool, args: Record<string, unknown>): Promise<T> {
    if (!(READ_ONLY_TOOLS as readonly string[]).includes(name)) {
      throw new Error(`Refusing to call Fold tool "${name}": only read-only tools are allowed`);
    }
    await this.ensureInitialized();
    const result = (await this.rpc('tools/call', { name, arguments: args })) as {
      structuredContent?: T;
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      throw new Error(`Fold ${name} failed: ${result.content?.[0]?.text?.slice(0, 200) ?? 'error'}`);
    }
    if (result.structuredContent) return result.structuredContent;
    const text = result.content?.find((c) => c.type === 'text')?.text;
    if (!text) throw new Error(`Fold ${name} returned no content`);
    return JSON.parse(text) as T;
  }
}

// ---------------------------------------------------------------------------
// Typed reads
// ---------------------------------------------------------------------------

interface FoldBankAccountRaw {
  id: string;
  bank_name: string;
  masked_number: string;
  holder_name: string | null;
  account_type: string | null;
}

export interface FoldTransactionRaw {
  id: string;
  account_id: string;
  amount: number;
  type: string;
  currency: string;
  date: string;
  narration: string;
  merchant_name: string | null;
  category: { id: string; name: string } | null;
  split_type: string | null;
}

export async function fetchFoldAccounts(session = new FoldSession()): Promise<FoldAccountSummary[]> {
  const res = await session.callTool<{ accounts: FoldBankAccountRaw[] | null }>('list_bank_accounts', {});
  return (res.accounts ?? []).map((a) => ({
    id: a.id,
    bankName: a.bank_name,
    maskedNumber: a.masked_number,
    holderName: a.holder_name?.trim() || null,
    accountType: a.account_type ?? null,
  }));
}

/** Every credit on these accounts since `startDate` (YYYY-MM-DD), all pages. */
export async function fetchFoldCredits(
  accountIds: string[],
  startDate: string,
  session = new FoldSession()
): Promise<FoldTransactionRaw[]> {
  const out: FoldTransactionRaw[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 30; page++) {
    const res: { transactions: FoldTransactionRaw[] | null; next_cursor: string | null } = await session.callTool(
      'list_transactions',
      {
        type: 'credit',
        start_date: startDate,
        account_ids: accountIds,
        limit: 100,
        sort_by: 'date',
        sort_order: 'desc',
        ...(cursor ? { cursor } : {}),
      }
    );
    out.push(...(res.transactions ?? []));
    cursor = res.next_cursor;
    if (!cursor) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Settings and status
// ---------------------------------------------------------------------------

export interface FoldSettings {
  accounts: FoldAccountSummary[];
  selectedAccountIds: string[];
  minAmount: number;
  notifyEmails: string[];
  lastSuccessfulSyncAt: string | null;
}

export async function getFoldSettings(): Promise<FoldSettings> {
  const d = (await readFoldDoc()) ?? {};
  return {
    accounts: d.accounts ?? [],
    selectedAccountIds: d.selectedAccountIds ?? [],
    minAmount: typeof d.minAmount === 'number' ? d.minAmount : DEFAULT_MIN_AMOUNT,
    notifyEmails: d.notifyEmails ?? DEFAULT_NOTIFY_EMAILS,
    lastSuccessfulSyncAt: d.lastSuccessfulSyncAt ?? null,
  };
}

export async function updateFoldSettings(patch: {
  selectedAccountIds?: string[];
  minAmount?: number;
  notifyEmails?: string[];
  accounts?: FoldAccountSummary[];
}): Promise<void> {
  const extra: Partial<FoldDoc> = {};
  if (patch.selectedAccountIds) {
    // A newly ticked account gets the 60-day backfill (rows already stored
    // are skipped, and a backfill sends no email).
    const before = new Set((await getFoldSettings()).selectedAccountIds);
    if (patch.selectedAccountIds.some((id) => !before.has(id))) extra.lastSuccessfulSyncAt = null;
  }
  await foldRef().set({ ...patch, ...extra }, { merge: true });
}

/**
 * Saves the sync result. `advance` moves the "read since" point forward; it is
 * false when nothing was actually read (no account picked), so the first real
 * sync still backfills.
 */
export async function recordFoldSync(summary: FoldSyncSummary, advance = summary.ok): Promise<void> {
  await foldRef().set(
    { lastSync: summary, ...(advance ? { lastSuccessfulSyncAt: summary.at } : {}) },
    { merge: true }
  );
}

export async function getFoldConnectionStatus(): Promise<FoldConnectionStatus> {
  const d = (await readFoldDoc()) ?? {};
  const settings = await getFoldSettings();
  return {
    connected: Boolean(d.refreshToken),
    needsReconnect: Boolean(d.needsReconnect),
    connectedBy: d.connectedBy ?? null,
    connectedAt: d.connectedAt ?? null,
    accounts: settings.accounts,
    selectedAccountIds: settings.selectedAccountIds,
    minAmount: settings.minAmount,
    notifyEmails: settings.notifyEmails,
    lastSync: d.lastSync ?? null,
    lastError: d.lastError ?? null,
  };
}
