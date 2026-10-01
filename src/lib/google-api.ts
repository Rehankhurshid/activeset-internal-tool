import 'server-only';
import { createSign } from 'node:crypto';
import { getServiceAccountCredentials } from '@/lib/firebase-admin';

/**
 * Minimal Google API access for the delivery tracker sheet.
 *
 * Deliberately not the `googleapis` package: that is a very large dependency to
 * carry into a serverless bundle for two endpoints, and this codebase has
 * already been bitten once by a dependency that resolved locally and broke a
 * clean install. The JWT bearer flow is a signed assertion and a token
 * exchange, both of which node:crypto and fetch can do.
 *
 * The signing key is the Firebase service account this app already runs as.
 * Sheets and Drive must be enabled on the same GCP project; until they are,
 * every call here fails with a message saying exactly that rather than a raw
 * Google error.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  // `drive.file` only grants access to files this app created, which is the
  // narrowest scope that still allows creating a sheet and sharing it.
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** True when the fix is a configuration change rather than a code change. */
    public configuration = false,
    /** A machine-readable reason the UI can act on, e.g. `needs_sheet`, `read_only`. */
    public code?: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cached: CachedToken | null = null;

/**
 * Exchanges a self-signed JWT for an access token, cached until shortly before
 * it expires. Tokens last an hour and a serverless instance handles many
 * requests, so re-signing per call would be pure waste.
 */
export async function getGoogleAccessToken(scopes: string = SHEETS_SCOPES): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    throw new GoogleApiError(
      503,
      'No service account key is configured, so the tracker sheet cannot be reached. Set FIREBASE_SERVICE_ACCOUNT_JSON.',
      true,
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: scopes,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  let signature: string;
  try {
    signature = base64url(signer.sign(credentials.privateKey));
  } catch {
    throw new GoogleApiError(500, 'The service account private key could not be used to sign a request.', true);
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new GoogleApiError(502, `Google refused the service account: ${body.error_description ?? res.status}`);
  }

  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function googleFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getGoogleAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.ok) return (await res.json().catch(() => ({}))) as T;

  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
  const message = body.error?.message ?? `${res.status} ${res.statusText}`;

  // The most likely first-run failure by a wide margin, and the one whose fix
  // is a click in the Cloud console rather than anything in this codebase.
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    throw new GoogleApiError(
      503,
      'The Google Sheets and Drive APIs are not enabled for this project yet. Enable both in the Google Cloud console for the Firebase project, then try again.',
      true,
    );
  }
  if (res.status === 404) throw new GoogleApiError(404, 'That spreadsheet could not be found, or this app has no access to it.');
  throw new GoogleApiError(res.status, message);
}

export interface SheetGrid {
  /** Tab title. */
  title: string;
  /** Row-major values. Everything is written as a string; Sheets infers the rest. */
  rows: (string | number)[][];
  /** Rows to freeze at the top, usually 1. */
  frozenRows?: number;
}

/*
 * There is no createSpreadsheet here on purpose. Google gives service accounts
 * no Drive storage (this app's reports a quota of 0), so a spreadsheet the app
 * creates is refused with "The caller does not have permission". The app writes
 * into sheets the team owns and has shared with it as an Editor.
 */

/** A tab title as an A1 range prefix: quoted, with quotes doubled. */
function quoteTab(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** A raw `spreadsheets.get` with a field mask, for the template builder. */
export async function getSpreadsheetFields<T>(spreadsheetId: string, fields: string): Promise<T> {
  return googleFetch<T>(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(fields)}`);
}

/** Raw `spreadsheets.batchUpdate`, for the template builder: formatting, validation, tabs. */
export async function batchUpdateSpreadsheet(spreadsheetId: string, requests: unknown[]): Promise<{ replies?: Record<string, unknown>[] }> {
  return googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

/** Writes several ranges at once. `USER_ENTERED` lets Sheets read "3 Sep 2026" as a date. */
export async function writeRanges(
  spreadsheetId: string,
  data: { tab: string; start?: string; rows: (string | number)[][] }[],
  input: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED',
): Promise<void> {
  await googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: input,
      data: data.map((d) => ({ range: `${quoteTab(d.tab)}!${d.start ?? 'A1'}`, values: d.rows })),
    }),
  });
}

/** Adds an empty tab to a sheet the app can edit. */
export async function addTab(spreadsheetId: string, title: string, frozenRows = 1): Promise<void> {
  await googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: frozenRows } } } }],
    }),
  });
}

/**
 * Replaces a tab's contents.
 *
 * Clears first: without it, shrinking the page list would leave the removed
 * rows behind, and a client reading a stale row is worse than a missing one.
 */
export async function writeGrid(spreadsheetId: string, grid: SheetGrid): Promise<void> {
  const tab = encodeURIComponent(quoteTab(grid.title));
  await googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${tab}!A1:ZZ10000:clear`, { method: 'POST', body: '{}' });
  await googleFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${tab}!A1?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: grid.rows }),
  });
}

export async function readGrid(spreadsheetId: string, tabTitle?: string): Promise<string[][]> {
  const range = tabTitle ? `${encodeURIComponent(quoteTab(tabTitle))}!A1:ZZ10000` : 'A1:ZZ10000';
  const body = await googleFetch<{ values?: string[][] }>(`${SHEETS_API}/${spreadsheetId}/values/${range}`);
  return body.values ?? [];
}

export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const body = await googleFetch<{ sheets?: { properties?: { title?: string } }[] }>(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,
  );
  return (body.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);
}

/**
 * Grants a person access to a sheet this app created.
 *
 * `sendNotificationEmail: false` on purpose — the team decides when and how the
 * client hears about the tracker, in the kickoff email. Google announcing it
 * first, in Google's words, is not the introduction anyone wants.
 */
export async function shareSpreadsheet(
  spreadsheetId: string,
  email: string,
  role: 'reader' | 'writer' | 'commenter' = 'reader',
): Promise<void> {
  await googleFetch(`${DRIVE_API}/${spreadsheetId}/permissions?sendNotificationEmail=false`, {
    method: 'POST',
    body: JSON.stringify({ type: 'user', role, emailAddress: email }),
  });
}

/** Anyone with the link may read. Used when the client's email is unknown. */
export async function shareSpreadsheetByLink(spreadsheetId: string): Promise<void> {
  await googleFetch(`${DRIVE_API}/${spreadsheetId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  });
}

export interface SpreadsheetTab {
  /** Google's numeric id for the tab, used by batch updates. */
  sheetId?: number;
  title: string;
  /** `GRID` for a normal tab; `OBJECT` for a sheet holding only a chart, which has no cells to read. */
  type: string;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  url: string;
  /** The spreadsheet's locale (`en_US`, `en_IN`): how its numeric dates are written. */
  locale?: string;
  /** Tabs, in the sheet's order. */
  tabs: SpreadsheetTab[];
}

/** Title, link, locale and tabs. Also the cheapest way to learn whether the app can see a sheet at all. */
export async function getSpreadsheetMeta(spreadsheetId: string): Promise<SpreadsheetMeta> {
  const body = await googleFetch<{
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    properties?: { title?: string; locale?: string };
    sheets?: { properties?: { sheetId?: number; title?: string; sheetType?: string } }[];
  }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent('spreadsheetId,spreadsheetUrl,properties(title,locale),sheets.properties(sheetId,title,sheetType)')}`,
  );
  return {
    spreadsheetId: body.spreadsheetId ?? spreadsheetId,
    title: body.properties?.title ?? '',
    url: body.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    locale: body.properties?.locale,
    tabs: (body.sheets ?? [])
      .map((s) => ({ sheetId: s.properties?.sheetId, title: s.properties?.title ?? '', type: s.properties?.sheetType ?? 'GRID' }))
      .filter((t) => t.title),
  };
}

/** A cell as read for the project sheet: its displayed text and the link on it, if any. */
export interface LinkedCell {
  v: string;
  link?: string;
}

/** How much of each tab the project sheet reader looks at. Far beyond any tracker in Drive today. */
const PROJECT_SHEET_RANGE = 'A1:AD800';


/**
 * Several tabs in one request, as displayed (dates and statuses as the team
 * sees them, formulas already calculated) and with each cell's link, which a
 * plain values read leaves out. Staging links are usually a hyperlinked word.
 */
export async function readTabsWithLinks(spreadsheetId: string, tabs: string[]): Promise<Map<string, LinkedCell[][]>> {
  const out = new Map<string, LinkedCell[][]>();
  if (tabs.length === 0) return out;
  const ranges = tabs.map((t) => `ranges=${encodeURIComponent(`${quoteTab(t)}!${PROJECT_SHEET_RANGE}`)}`).join('&');
  const fields = encodeURIComponent('sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,hyperlink))))');
  const body = await googleFetch<{
    sheets?: {
      properties?: { title?: string };
      data?: { startRow?: number; startColumn?: number; rowData?: { values?: { formattedValue?: string; hyperlink?: string }[] }[] }[];
    }[];
  }>(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?includeGridData=true&${ranges}&fields=${fields}`);

  for (const sheet of body.sheets ?? []) {
    const title = sheet.properties?.title;
    if (!title) continue;
    const grid: LinkedCell[][] = [];
    for (const data of sheet.data ?? []) {
      const rowOffset = data.startRow ?? 0;
      const colOffset = data.startColumn ?? 0;
      (data.rowData ?? []).forEach((row, i) => {
        const cells: LinkedCell[] = [];
        (row.values ?? []).forEach((value, j) => {
          const cell: LinkedCell = { v: value.formattedValue ?? '' };
          if (value.hyperlink) cell.link = value.hyperlink;
          cells[colOffset + j] = cell;
        });
        grid[rowOffset + i] = Array.from(cells, (c) => c ?? { v: '' });
      });
    }
    out.set(title, Array.from(grid, (row) => row ?? []));
  }
  return out;
}

/** Pulls the spreadsheet id out of any Google Sheets URL, or accepts a bare id. */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}
