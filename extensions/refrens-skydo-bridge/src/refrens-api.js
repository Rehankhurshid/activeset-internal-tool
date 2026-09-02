/* Talks to the ActiveSet internal tool, not to Refrens.

   Earlier versions held Refrens credentials in the browser. They no longer do:
   the Refrens account is authenticated with an ES256 signing key that can mint
   tokens for the whole account, so it stays on the server. Instead each person
   pairs the extension once from app.activeset.co/modules/internal-tools and
   receives their own opaque token, which only reaches the proxy routes.

   Access is re-checked server-side on every request against the Invoices module,
   so removing someone in Settings → Team Access cuts them off immediately —
   there is no key to rotate. */

const DEFAULT_API_BASE = 'https://app.activeset.co';
const NET_TIMEOUT_MS = 20_000;

class NeedsConnect extends Error {
  constructor(msg) { super(msg); this.code = 'NEEDS_CONNECT'; }
}

/* No request may hang: a stalled socket used to leave the panel spinning with
   nothing to report. */
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

async function savePairing({ token, apiBase, urlKey, pairedAs }) {
  await chrome.storage.local.set({
    extToken: token,
    apiBase: apiBase || DEFAULT_API_BASE,
    refrensUrlKey: urlKey || null,
    pairedAs: pairedAs || null,
    pairedAt: new Date().toISOString(),
  });
}

async function clearPairing() {
  await chrome.storage.local.remove(['extToken', 'pairedAs', 'pairedAt']);
}

async function pairingStatus() {
  const s = await chrome.storage.local.get(['extToken', 'apiBase', 'refrensUrlKey', 'pairedAs', 'pairedAt']);
  return {
    connected: !!s.extToken,
    apiBase: s.apiBase || DEFAULT_API_BASE,
    urlKey: s.refrensUrlKey || null,
    pairedAs: s.pairedAs || null,
    pairedAt: s.pairedAt || null,
  };
}

async function requirePairing() {
  const s = await pairingStatus();
  if (!s.connected) {
    throw new NeedsConnect(
      'Not paired yet. Open app.activeset.co → Internal Tools and click "Pair with this browser".'
    );
  }
  return s;
}

async function apiGet(path, params) {
  const { apiBase } = await requirePairing();
  const { extToken } = await chrome.storage.local.get('extToken');

  const url = new URL(`${apiBase}${path}`);
  for (const [k, v] of params || []) url.searchParams.append(k, v);

  const res = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${extToken}` } },
    `ActiveSet ${path}`
  );

  if (res.status === 401) {
    await clearPairing();
    throw new NeedsConnect('This browser is no longer paired. Re-pair from Internal Tools.');
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new NeedsConnect(body.error || 'You no longer have access to Invoices.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `ActiveSet API ${res.status}`);
  }
  return res.json();
}

const LIST_PATH = '/api/extension/refrens/invoices';

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
    apiGet(LIST_PATH, [['currency', currency], ['totals.total[$gte]', lo], ['totals.total[$lte]', hi], ['$limit', '20']]),
    apiGet(LIST_PATH, [['currency', currency], ['balance.due[$gte]', lo], ['balance.due[$lte]', hi], ['$limit', '20']]),
    apiGet(LIST_PATH, [['currency', currency], ['status[$in][]', 'UNPAID'], ['status[$in][]', 'PARTIALLY_PAID'], ['$limit', '50']]),
    pattern
      ? apiGet(LIST_PATH, [['billedTo.name[$regex]', pattern], ['billedTo.name[$options]', 'i'], ['$limit', '20']])
      : Promise.resolve({ data: [] }),
  ];

  // One dead probe must not sink the others -- a partial candidate set still ranks.
  const settled = await Promise.allSettled(probes);
  const byId = new Map();
  let ok = 0;
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    ok++;
    for (const inv of (r.value && r.value.data) || []) byId.set(inv._id, inv);
  }
  if (!ok) throw settled.find((r) => r.status === 'rejected').reason;
  return { rows: [...byId.values()], probes: ok };
}

/* The browse tab: one page at a time, optionally narrowed server-side. */
async function browseInvoices({ currency, skip = 0, limit = 50, search }) {
  const params = [['$limit', String(limit)], ['$sort[invoiceDate]', '-1']];
  if (currency) params.push(['currency', currency]);
  if (skip) params.push(['$skip', String(skip)]);
  if (search && search.trim().length >= 2) {
    const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    params.push(['$or[0][invoiceNumber][$regex]', term], ['$or[0][invoiceNumber][$options]', 'i']);
    params.push(['$or[1][billedTo.name][$regex]', term], ['$or[1][billedTo.name][$options]', 'i']);
  }
  const body = await apiGet(LIST_PATH, params);
  return { rows: (body && body.data) || [], total: (body && body.total) || 0 };
}

const getInvoice = (id) => apiGet(`${LIST_PATH}/${encodeURIComponent(id)}`);

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
    appUrl: null, // filled in by the caller, which knows the urlKey
  };
}
