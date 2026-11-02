/**
 * Content syncs: the pipes that carry a client's data into their site, such as
 * PeakXV's and Surge's Airtable bases reaching Webflow through Whalesync.
 *
 * When one breaks (October: a Disclosure field mapping error) the client's site
 * quietly stops updating, and nobody outside the team can tell. The team adds
 * each sync to the project on the Client tab and keeps it current by hand, or,
 * when `WHALESYNC_API_KEY` is set and the row is linked to a Whalesync sync,
 * the server reads its status, last run and open issues from Whalesync.
 *
 * Pure: types, cleaning, the client's projection and the Whalesync mapping.
 * The client sees a row's name, provider, source → destination, whether it is
 * running, when it last ran, how many issues are open and one line the team
 * wrote for them. Never the team's notes, the issue messages, the provider's
 * ids or who edited it.
 */

export type ContentSyncState = 'active' | 'paused' | 'error';

export const CONTENT_SYNC_STATES: ContentSyncState[] = ['active', 'paused', 'error'];

/** What the client reads for each state. */
export const CONTENT_SYNC_STATE_LABELS: Record<ContentSyncState, string> = {
  active: 'Running',
  paused: 'Paused',
  error: 'Needs attention',
};

/** One issue as Whalesync reports it. Team-only: messages name records and fields. */
export interface ContentSyncIssue {
  code: string;
  message?: string;
  table?: string;
  count?: number;
  lastSeenAt?: string;
}

/** Stored at `projects/{id}/content_syncs/{syncId}` (firebase-admin only). */
export interface ContentSync {
  id: string;
  /** What it carries, in the client's words: "Portfolio companies". */
  name: string;
  /** "Whalesync", "Zapier", "Make"… */
  provider?: string;
  /** "Airtable · Portfolio" */
  source?: string;
  /** "Webflow · Companies collection" */
  destination?: string;
  state: ContentSyncState;
  /** ISO timestamp the sync last ran (Whalesync: last polled). */
  lastRunAt?: string;
  openIssues: number;
  /** Team-only notes: what broke, who is on it. */
  notes?: string;
  /** One line for the client ("Updates resume once the Disclosure field is fixed"). */
  clientNote?: string;
  /** Whether the client's page shows it. */
  showToClient: boolean;
  order: number;
  /** The Whalesync sync id (`sync_…`). Set: the server can refresh the row. */
  whalesyncId?: string;
  /** Last read from Whalesync, and what it said that the client never sees. */
  refreshedAt?: string;
  refreshError?: string;
  issues?: ContentSyncIssue[];
  /** A side whose connection Whalesync reports broken ("Airtable: needs reconnecting"). */
  authErrors?: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** What the client's page gets for one sync. Nothing else leaves the row. */
export interface PortalContentSyncView {
  id: string;
  name: string;
  provider?: string;
  source?: string;
  destination?: string;
  state: ContentSyncState;
  /** Client wording for `state`. */
  stateLabel: string;
  lastRunAt?: string;
  openIssues: number;
  note?: string;
}

/** The keys of `PortalContentSyncView`, checked by the test. */
export const PORTAL_CONTENT_SYNC_KEYS = [
  'id',
  'name',
  'provider',
  'source',
  'destination',
  'state',
  'stateLabel',
  'lastRunAt',
  'openIssues',
  'note',
] as const;

/** A running sync that has not run for this long reads as needing attention. */
export const CONTENT_SYNC_STALE_AFTER_HOURS = 24;

export const MAX_CONTENT_SYNCS = 20;

const LIMITS = { name: 120, provider: 60, side: 160, notes: 4000, clientNote: 240 } as const;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function longText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/**
 * A Whalesync sync id from what the team pasted: the id itself, or any link
 * or text with one in it. Undefined when there is none.
 */
export function parseWhalesyncId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/sync_[A-Za-z0-9-]{6,80}/);
  return match ? match[0] : undefined;
}

/** The fields the team edits. `undefined` = not in the request. */
export interface ContentSyncInput {
  name?: string;
  provider?: string | null;
  source?: string | null;
  destination?: string | null;
  state?: ContentSyncState;
  lastRunAt?: string | null;
  openIssues?: number;
  notes?: string | null;
  clientNote?: string | null;
  showToClient?: boolean;
  whalesyncId?: string | null;
}

/**
 * Cleans a create or edit from the Client tab. Strings are trimmed and capped,
 * an empty string clears a field (`null`), unknown states, bad dates and
 * negative counts are refused. Returns the error to show instead when a field
 * is unusable.
 */
export function cleanContentSyncInput(
  raw: unknown,
): { ok: true; input: ContentSyncInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to save' };
  const body = raw as Record<string, unknown>;
  const input: ContentSyncInput = {};

  if (body.name !== undefined) {
    const name = text(body.name, LIMITS.name);
    if (!name) return { ok: false, error: 'Give the sync a name' };
    input.name = name;
  }
  for (const key of ['provider', 'source', 'destination'] as const) {
    if (body[key] !== undefined) input[key] = text(body[key], key === 'provider' ? LIMITS.provider : LIMITS.side) ?? null;
  }
  if (body.notes !== undefined) input.notes = longText(body.notes, LIMITS.notes) ?? null;
  if (body.clientNote !== undefined) input.clientNote = text(body.clientNote, LIMITS.clientNote) ?? null;
  if (body.state !== undefined) {
    if (!CONTENT_SYNC_STATES.includes(body.state as ContentSyncState)) return { ok: false, error: 'Unknown status' };
    input.state = body.state as ContentSyncState;
  }
  if (body.lastRunAt !== undefined) {
    if (body.lastRunAt === null || body.lastRunAt === '') input.lastRunAt = null;
    else {
      const iso = isoOrUndefined(body.lastRunAt);
      if (!iso) return { ok: false, error: 'Last run is not a date' };
      input.lastRunAt = iso;
    }
  }
  if (body.openIssues !== undefined) {
    const n = typeof body.openIssues === 'string' ? Number(body.openIssues) : body.openIssues;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return { ok: false, error: 'Issues must be 0 or more' };
    input.openIssues = Math.min(1_000_000, Math.floor(n));
  }
  if (body.showToClient !== undefined) {
    if (typeof body.showToClient !== 'boolean') return { ok: false, error: 'Bad visibility' };
    input.showToClient = body.showToClient;
  }
  if (body.whalesyncId !== undefined) {
    if (body.whalesyncId === null || body.whalesyncId === '') input.whalesyncId = null;
    else {
      const id = parseWhalesyncId(body.whalesyncId);
      if (!id) return { ok: false, error: 'That is not a Whalesync sync id (sync_…)' };
      input.whalesyncId = id;
    }
  }
  return { ok: true, input };
}

/**
 * How a sync reads at a glance: fine, worth a look (open issues, paused, or a
 * running sync that has not run for a day), or broken.
 */
export type ContentSyncTone = 'ok' | 'attention' | 'error';

export function contentSyncTone(
  sync: Pick<ContentSync, 'state' | 'openIssues' | 'lastRunAt'>,
  now: Date = new Date(),
): ContentSyncTone {
  if (sync.state === 'error') return 'error';
  if (sync.state === 'paused' || sync.openIssues > 0) return 'attention';
  if (isContentSyncStale(sync, now)) return 'attention';
  return 'ok';
}

/** A running sync whose last run is more than a day old. Never true without a last run. */
export function isContentSyncStale(sync: Pick<ContentSync, 'state' | 'lastRunAt'>, now: Date = new Date()): boolean {
  if (sync.state !== 'active' || !sync.lastRunAt) return false;
  const ms = Date.parse(sync.lastRunAt);
  return !Number.isNaN(ms) && now.getTime() - ms > CONTENT_SYNC_STALE_AFTER_HOURS * 3_600_000;
}

/** Rows in the team's order, then by name. */
export function sortContentSyncs<T extends Pick<ContentSync, 'order' | 'name'>>(syncs: readonly T[]): T[] {
  return [...syncs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

/**
 * The client's chips: only rows the team shows, only the allow-listed fields.
 * Any other field on the row, whatever the caller passes, stays behind.
 */
export function portalContentSyncs(syncs: readonly Partial<ContentSync>[] | undefined): PortalContentSyncView[] {
  if (!syncs?.length) return [];
  return sortContentSyncs(
    syncs.filter((s): s is ContentSync => !!s && s.showToClient !== false && typeof s.name === 'string' && !!s.name.trim() && !!s.id),
  ).map((s) => {
    const state = CONTENT_SYNC_STATES.includes(s.state) ? s.state : 'active';
    const view: PortalContentSyncView = {
      id: s.id,
      name: s.name.trim(),
      state,
      stateLabel: CONTENT_SYNC_STATE_LABELS[state],
      openIssues: typeof s.openIssues === 'number' && s.openIssues > 0 ? Math.floor(s.openIssues) : 0,
    };
    const provider = text(s.provider, LIMITS.provider);
    const source = text(s.source, LIMITS.side);
    const destination = text(s.destination, LIMITS.side);
    const lastRunAt = isoOrUndefined(s.lastRunAt);
    const note = text(s.clientNote, LIMITS.clientNote);
    if (provider) view.provider = provider;
    if (source) view.source = source;
    if (destination) view.destination = destination;
    if (lastRunAt) view.lastRunAt = lastRunAt;
    if (note) view.note = note;
    return view;
  });
}

// ---------------------------------------------------------------------------
// Whalesync (https://docs.whalesync.com/api/reference, OpenAPI at
// https://api.whalesync.com/v1/openapi.json). Only the fields read here.

export interface WhalesyncSide {
  connector?: string;
  base?: { name?: string | null } | null;
  auth_status?: 'connected' | 'error' | string;
  auth_error?: string | null;
}

export interface WhalesyncSync {
  id: string;
  name?: string;
  status?: 'draft' | 'active' | 'paused' | string;
  left?: WhalesyncSide | null;
  right?: WhalesyncSide | null;
  open_issues?: number;
  initial_sync_running?: boolean;
  last_synced_at?: string | null;
}

export interface WhalesyncIssue {
  code?: string;
  message?: string | null;
  table?: { name?: string | null } | null;
  occurrence_count?: number;
  last_seen_at?: string;
}

const CONNECTOR_NAMES: Record<string, string> = {
  airtable: 'Airtable',
  webflow: 'Webflow',
  notion: 'Notion',
  hubspot: 'HubSpot',
  postgres: 'Postgres',
  supabase: 'Supabase',
  framer: 'Framer',
  wordpress: 'WordPress',
  google_sheets: 'Google Sheets',
};

export function connectorName(connector: string | undefined): string {
  if (!connector) return '';
  return (
    CONNECTOR_NAMES[connector.toLowerCase()] ??
    connector.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** "Airtable · Portfolio", from one side of a Whalesync sync. */
export function whalesyncSideLabel(side: WhalesyncSide | null | undefined): string | undefined {
  if (!side) return undefined;
  const parts = [connectorName(side.connector), side.base?.name?.trim()].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * What a Whalesync read changes on the row. A side Whalesync cannot reach is
 * `error` whatever the sync's own status; a draft is not running yet, so
 * `paused`; a sync whose first run is under way reads `paused` in Whalesync but
 * is working, so `active`. Source and destination are filled only where the
 * team left them empty.
 */
export function fromWhalesync(
  sync: WhalesyncSync,
  issues: readonly WhalesyncIssue[],
  current: Pick<ContentSync, 'source' | 'destination' | 'provider'>,
  now: Date = new Date(),
): Partial<ContentSync> & { refreshedAt: string } {
  const authErrors = [sync.left, sync.right]
    .filter((side): side is WhalesyncSide => !!side && side.auth_status === 'error')
    .map((side) => `${connectorName(side.connector) || 'A side'}: needs reconnecting${side.auth_error ? ` (${side.auth_error})` : ''}`);
  const state: ContentSyncState =
    authErrors.length > 0
      ? 'error'
      : sync.status === 'active' || sync.initial_sync_running
        ? 'active'
        : 'paused';
  const patch: Partial<ContentSync> & { refreshedAt: string } = {
    state,
    openIssues: typeof sync.open_issues === 'number' && sync.open_issues > 0 ? Math.floor(sync.open_issues) : 0,
    issues: issues.slice(0, 10).map((issue) => {
      const out: ContentSyncIssue = { code: text(issue.code, 80) ?? 'issue' };
      const message = text(issue.message, 500);
      const table = text(issue.table?.name, 120);
      const lastSeenAt = isoOrUndefined(issue.last_seen_at);
      if (message) out.message = message;
      if (table) out.table = table;
      if (typeof issue.occurrence_count === 'number') out.count = issue.occurrence_count;
      if (lastSeenAt) out.lastSeenAt = lastSeenAt;
      return out;
    }),
    authErrors,
    refreshedAt: now.toISOString(),
  };
  const lastRunAt = isoOrUndefined(sync.last_synced_at);
  if (lastRunAt) patch.lastRunAt = lastRunAt;
  if (!current.provider) patch.provider = 'Whalesync';
  if (!current.source) {
    const source = whalesyncSideLabel(sync.left);
    if (source) patch.source = source;
  }
  if (!current.destination) {
    const destination = whalesyncSideLabel(sync.right);
    if (destination) patch.destination = destination;
  }
  return patch;
}
