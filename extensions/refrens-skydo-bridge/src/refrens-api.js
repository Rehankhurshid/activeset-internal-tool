/* Refrens API client, running in the background service worker so host_permissions
   cover CORS.

   Two ways to authenticate, tried in that order:

   1. API keys (Refrens dashboard -> Settings -> Integrations -> Generate API Keys).
      POST /authentication {strategy:'app-secret', appId, appSecret} -> {accessToken}.
      Preferred: it survives with no Refrens tab open.
   2. The session token from an open Refrens tab (sessionStorage.__at), relayed by
      the content script. Zero setup, but only while a Refrens tab exists. */

const REFRENS_API = 'https://api.refrens.com';
const NET_TIMEOUT_MS = 20_000;

/* No request may hang. Without this a stalled socket left the panel spinning
   with nothing to show, because the promise simply never settled. */
async function fetchWithTimeout(url, opts, label) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NET_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${label} timed out after ${NET_TIMEOUT_MS / 1000}s.`);
    throw new Error(`${label} failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

class NeedsConnect extends Error {
  constructor(msg) { super(msg); this.code = 'NEEDS_CONNECT'; }
}

function jwtExpiry(token) {
  try {
    let p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (p.length % 4) p += '=';
    const { exp } = JSON.parse(atob(p));
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch { return 0; }
}

const unexpired = (exp) => !exp || exp > Date.now() + 30_000;

/* --- credential exchange --------------------------------------------------- */

/* The probes run concurrently and each needs a bearer, so without this they all
   miss the cache together and fire their own sign-in. One exchange, shared. */
let pendingExchange = null;

async function tokenFromApiKeys() {
  const { appId, appSecret, apiToken, apiTokenExp } = await chrome.storage.local.get(
    ['appId', 'appSecret', 'apiToken', 'apiTokenExp']
  );
  if (!appId || !appSecret) return null;
  if (apiToken && unexpired(apiTokenExp)) return apiToken;
  if (pendingExchange) return pendingExchange;

  pendingExchange = exchangeApiKeys(appId, appSecret).finally(() => { pendingExchange = null; });
  return pendingExchange;
}

async function exchangeApiKeys(appId, appSecret) {
  const res = await fetchWithTimeout(`${REFRENS_API}/authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: 'app-secret', appId, appSecret })
  }, 'Refrens sign-in');
  if (!res.ok) throw new NeedsConnect(`Refrens rejected the API keys (${res.status}). Check them in settings.`);
  const { accessToken } = await res.json();
  if (!accessToken) throw new NeedsConnect('Refrens returned no access token for those API keys.');
  await chrome.storage.local.set({ apiToken: accessToken, apiTokenExp: jwtExpiry(accessToken) });
  return accessToken;
}

async function tokenFromSession() {
  const { sessionToken, sessionTokenExp } = await chrome.storage.local.get(['sessionToken', 'sessionTokenExp']);
  return sessionToken && unexpired(sessionTokenExp) ? sessionToken : null;
}

async function saveSession({ token, urlKey }) {
  const patch = {};
  if (token) { patch.sessionToken = token; patch.sessionTokenExp = jwtExpiry(token); }
  if (urlKey) patch.refrensUrlKey = urlKey;
  await chrome.storage.local.set(patch);
}

async function authStatus() {
  const { appId, refrensUrlKey } = await chrome.storage.local.get(['appId', 'refrensUrlKey']);
  const session = await tokenFromSession();
  return {
    hasApiKeys: !!appId,
    hasSession: !!session,
    connected: !!appId || !!session,
    urlKey: refrensUrlKey || null
  };
}

async function requireAuth() {
  const token = (await tokenFromApiKeys()) || (await tokenFromSession());
  if (!token) {
    throw new NeedsConnect(
      'No Refrens credentials. Add API keys in settings, or open your Refrens dashboard in a tab.'
    );
  }
  const { refrensUrlKey } = await chrome.storage.local.get('refrensUrlKey');
  if (!refrensUrlKey) {
    throw new NeedsConnect('Refrens business not identified. Open your Refrens dashboard once, or set the URL key in settings.');
  }
  return { token, urlKey: refrensUrlKey };
}

/* --- requests -------------------------------------------------------------- */
async function refrensGet(path, params) {
  const { token, urlKey } = await requireAuth();
  const url = new URL(`${REFRENS_API}/businesses/${urlKey}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, `Refrens ${path}`);
  if (res.status === 401) {
    await chrome.storage.local.remove(['sessionToken', 'sessionTokenExp', 'apiToken', 'apiTokenExp']);
    throw new NeedsConnect('Refrens session expired. Reopen Refrens, or re-check your API keys.');
  }
  if (!res.ok) throw new Error(`Refrens API ${res.status} on ${path}`);
  return res.json();
}

/* Refrens is Feathers-backed, so the query string does the work: nested paths
   (`totals.total`), operators (`$gte`, `$in`, `$regex`, `$or`) and `$select` all
   land on the server. Two things follow, both worth ~an order of magnitude:

     - `$select` trims a 25 KB invoice document to ~1 KB. Listing 50 invoices goes
       from ~2.5 MB to ~9 KB.
     - The match can be *asked for* rather than fetched-then-filtered. Pulling 150
       invoices to find one was the slow part; four targeted probes answer in about
       350 ms combined.

   `$regex` is case-sensitive unless `$options=i` is passed. `$search` is rejected. */

const LIST_FIELDS = [
  'invoiceNumber', 'currency', 'totals', 'status', 'billedTo', 'balance', 'invoiceDate', 'dueDate'
];

function invoiceQuery(pairs, { limit = 50, skip = 0, sort = '$sort[invoiceDate]' } = {}) {
  const url = new URL(`${REFRENS_API}/businesses/__KEY__/invoices`);
  for (const [k, v] of pairs) url.searchParams.append(k, v);
  for (const f of LIST_FIELDS) url.searchParams.append('$select[]', f);
  url.searchParams.set('$limit', limit);
  if (skip) url.searchParams.set('$skip', skip);
  if (sort) url.searchParams.set(sort, -1);
  return url;
}

async function runQuery(pairs, opts) {
  const { token, urlKey } = await requireAuth();
  const url = new URL(invoiceQuery(pairs, opts).href.replace('__KEY__', encodeURIComponent(urlKey)));
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, 'Refrens invoice query');
  if (res.status === 401) {
    await chrome.storage.local.remove(['sessionToken', 'sessionTokenExp', 'apiToken', 'apiTokenExp']);
    throw new NeedsConnect('Refrens session expired. Reopen Refrens, or re-check your API keys.');
  }
  if (!res.ok) throw new Error(`Refrens API ${res.status} on invoice query`);
  const body = await res.json();
  return { rows: Array.isArray(body.data) ? body.data : [], total: body.total || 0 };
}

/* Company suffixes are noise, and Refrens' regex is a plain substring match, so
   join the meaningful words with `.*` -- "Acme Holdings Inc" finds "Acme Holdings". */
const REGEX_NOISE = new Set(['inc', 'llc', 'ltd', 'limited', 'llp', 'plc', 'corp', 'corporation',
  'co', 'company', 'gmbh', 'bv', 'nv', 'pty', 'pte', 'sa', 'srl', 'ag', 'ab', 'the', 'and', 'of']);

function namePattern(name) {
  const words = String(name || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !REGEX_NOISE.has(w));
  return words.length ? words.join('.*') : null;
}

/* The fast path. Four small probes in parallel, deduped by id. Between them they
   cover: the amount as invoiced, the amount still outstanding, anything shaved by
   bank charges, everything still owed, and anything billed to this payer. */
async function findCandidates({ currency, amount, payerName }) {
  const lo = +(amount * 0.97).toFixed(2);
  const hi = +(amount * 1.03).toFixed(2);
  const pattern = namePattern(payerName);

  const probes = [
    runQuery([['currency', currency], ['totals.total[$gte]', lo], ['totals.total[$lte]', hi]], { limit: 20 }),
    runQuery([['currency', currency], ['balance.due[$gte]', lo], ['balance.due[$lte]', hi]], { limit: 20 }),
    runQuery([['currency', currency], ['status[$in][]', 'UNPAID'], ['status[$in][]', 'PARTIALLY_PAID']], { limit: 50 }),
    pattern
      ? runQuery([['billedTo.name[$regex]', pattern], ['billedTo.name[$options]', 'i']], { limit: 20 })
      : Promise.resolve({ rows: [], total: 0 })
  ];

  // One dead probe must not sink the others -- a partial candidate set still ranks.
  const settled = await Promise.allSettled(probes);
  const byId = new Map();
  let failures = 0;
  for (const r of settled) {
    if (r.status !== 'fulfilled') { failures++; continue; }
    for (const inv of r.value.rows) byId.set(inv._id, inv);
  }
  if (failures === settled.length) {
    throw settled.find((r) => r.status === 'rejected').reason;
  }
  return { rows: [...byId.values()], probes: settled.length - failures };
}

/* The browse tab: one page at a time, trimmed, optionally narrowed server-side. */
async function browseInvoices({ currency, skip = 0, limit = 50, search }) {
  const pairs = [];
  if (currency) pairs.push(['currency', currency]);
  if (search && search.trim().length >= 2) {
    const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pairs.push(['$or[0][invoiceNumber][$regex]', term]);
    pairs.push(['$or[0][invoiceNumber][$options]', 'i']);
    pairs.push(['$or[1][billedTo.name][$regex]', term]);
    pairs.push(['$or[1][billedTo.name][$options]', 'i']);
  }
  return runQuery(pairs, { limit, skip });
}

const getInvoice = (id) => refrensGet(`/invoices/${id}`);

/* Trim the invoice document down to what matching and the preview card need. */
function summarise(inv) {
  const totals = inv.totals || {};
  const balance = inv.balance || {};
  return {
    id: inv._id,
    number: inv.invoiceNumber || '',
    currency: inv.currency || '',
    total: totals.total || 0,
    due: typeof balance.due === 'number' ? balance.due : totals.total,
    paid: balance.paid || 0,
    status: inv.status || '',
    clientName: (inv.billedTo && inv.billedTo.name) || '',
    clientCountry: (inv.billedTo && inv.billedTo.country) || '',
    invoiceDate: inv.invoiceDate || '',
    dueDate: inv.dueDate || '',
    appUrl: null // filled in by the caller, which knows the urlKey
  };
}
