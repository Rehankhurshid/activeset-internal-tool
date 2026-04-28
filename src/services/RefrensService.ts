import 'server-only';
import jwt from 'jsonwebtoken';
import { getRefrensCredentials, type RefrensCredentials } from '@/services/appSecrets';

/**
 * Thin REST client for the Refrens invoice API.
 *
 * Server-only — never imported from client code. Credentials live in
 * app_secrets/refrens; we mint a fresh ES256 JWT on demand (Refrens auth
 * Method 2) and cache it in-memory until shortly before it expires.
 */

const DEFAULT_BASE_URL = 'https://www.refrens.com/api/v1';
const TOKEN_TTL_SECONDS = 60 * 60;        // 1 hour, max recommended by Refrens
const TOKEN_REFRESH_SKEW_SECONDS = 60;    // refresh 60s before expiry

function getBaseUrl(): string {
  return process.env.REFRENS_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

interface CachedToken {
  appId: string;
  token: string;
  expiresAt: number; // epoch seconds
}

let cachedToken: CachedToken | null = null;

function mintRefrensJwt(creds: RefrensCredentials): string {
  return jwt.sign(
    {
      iss: creds.appId,
      aud: 'serana',
      sub: creds.appId,
      auth: { entity: 'app', strategy: 'app-iss-app-token' },
    },
    creds.privateKey,
    { algorithm: 'ES256', expiresIn: TOKEN_TTL_SECONDS }
  );
}

function getCachedJwt(creds: RefrensCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.appId === creds.appId &&
    cachedToken.expiresAt - TOKEN_REFRESH_SKEW_SECONDS > now
  ) {
    return cachedToken.token;
  }
  const token = mintRefrensJwt(creds);
  cachedToken = {
    appId: creds.appId,
    token,
    expiresAt: now + TOKEN_TTL_SECONDS,
  };
  return token;
}

/** Test-only / settings-only: clears the in-memory token cache after the
 *  credentials change so the next call mints a fresh one. */
export function invalidateRefrensJwtCache(): void {
  cachedToken = null;
}

export class RefrensApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export class RefrensNotConfiguredError extends Error {
  constructor() {
    super('Refrens credentials are not configured');
  }
}

async function refrensFetch(
  creds: RefrensCredentials,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const url = `${getBaseUrl()}${path}`;
  const token = getCachedJwt(creds);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message?: unknown }).message ?? '')
        : '') || `Refrens API ${res.status}`;
    throw new RefrensApiError(res.status, message, parsed);
  }

  return parsed;
}

async function loadCreds(): Promise<RefrensCredentials> {
  const creds = await getRefrensCredentials();
  if (!creds) throw new RefrensNotConfiguredError();
  return creds;
}

export interface RefrensInvoiceSummary {
  _id: string;
  invoiceNumber?: string | number;
  status?: string;
  finalTotal?: {
    total?: number;
    amount?: number;
    subTotal?: number;
  };
  currency?: string;
  invoiceDate?: string;
  dueDate?: string;
  share?: {
    link?: string;
    pdf?: string;
  };
  billedTo?: {
    name?: string;
    email?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface RefrensListResponse {
  data?: RefrensInvoiceSummary[];
  total?: number;
  limit?: number;
  skip?: number;
}

export interface ListInvoicesOptions {
  limit?: number;
  skip?: number;
}

export async function listInvoices(
  options: ListInvoicesOptions = {}
): Promise<{ items: RefrensInvoiceSummary[]; total: number | null }> {
  const creds = await loadCreds();
  const params = new URLSearchParams();
  if (options.limit != null) params.set('$limit', String(options.limit));
  if (options.skip != null) params.set('$skip', String(options.skip));
  params.set('$sort[createdAt]', '-1');

  const path = `/businesses/${encodeURIComponent(creds.urlKey)}/invoices?${params.toString()}`;
  const raw = (await refrensFetch(creds, path)) as RefrensListResponse | RefrensInvoiceSummary[] | null;

  if (Array.isArray(raw)) {
    return { items: raw, total: raw.length };
  }
  return {
    items: raw?.data ?? [],
    total: typeof raw?.total === 'number' ? raw.total : null,
  };
}

export interface CreateInvoiceItem {
  name: string;
  rate: number;
  quantity: number;
}

export interface CreateInvoicePayload {
  billedTo: {
    name: string;
    email?: string;
  };
  items: CreateInvoiceItem[];
  invoiceDate: string;       // ISO date
  dueDate?: string;          // ISO date (optional)
  currency?: string;         // ISO 4217; defaults to Refrens account default
  invoiceType?: 'INVOICE' | 'BOS';
}

/**
 * Creates an invoice on Refrens. Returns the full Refrens invoice payload —
 * we slim it down to a {@link ProjectInvoice} mirror at the route layer.
 */
export async function createInvoice(
  payload: CreateInvoicePayload
): Promise<RefrensInvoiceSummary & { urlKey: string }> {
  const creds = await loadCreds();
  const body: Record<string, unknown> = {
    invoiceType: payload.invoiceType ?? 'INVOICE',
    invoiceDate: payload.invoiceDate,
    billedTo: {
      name: payload.billedTo.name,
      ...(payload.billedTo.email ? { email: payload.billedTo.email } : {}),
    },
    items: payload.items.map((item) => ({
      name: item.name,
      rate: item.rate,
      quantity: item.quantity,
    })),
  };
  if (payload.dueDate) body.dueDate = payload.dueDate;
  if (payload.currency) body.currency = payload.currency;

  const path = `/businesses/${encodeURIComponent(creds.urlKey)}/invoices`;
  const raw = (await refrensFetch(creds, path, {
    method: 'POST',
    body: JSON.stringify(body),
  })) as RefrensInvoiceSummary;

  return { ...raw, urlKey: creds.urlKey };
}

/** Fetches a single invoice from Refrens by id. Used by Phase 3 sync. */
export async function getInvoice(invoiceId: string): Promise<RefrensInvoiceSummary> {
  const creds = await loadCreds();
  const path = `/businesses/${encodeURIComponent(creds.urlKey)}/invoices/${encodeURIComponent(invoiceId)}`;
  return (await refrensFetch(creds, path)) as RefrensInvoiceSummary;
}
