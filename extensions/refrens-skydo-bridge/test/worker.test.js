/* Drives the service worker's message plumbing outside Chrome.

   Stubs just enough of the extension APIs and the Refrens endpoints to run a real
   FIND_MATCHES round trip, so the paths that matter -- credentials missing,
   credentials present, network stalled -- are checked without loading the
   extension. The point is that every one of them ANSWERS: the failure that sent
   me here was a request that simply never settled. */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const SRC = path.join(__dirname, '..', 'src');

function makeWorker({ store = {}, fetchImpl }) {
  const listeners = [];
  const ctx = {
    console: { debug() {}, error() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, URLSearchParams, AbortController, Promise, JSON, Math, Date, Object, Array,
    String, Number, Error, Set, Map, RegExp, atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    fetch: fetchImpl,
    importScripts: () => {},
    chrome: {
      storage: { local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async (patch) => Object.assign(store, patch),
        remove: async (keys) => [].concat(keys).forEach((k) => delete store[k])
      } },
      runtime: {
        onMessage: { addListener: (fn) => listeners.push(fn) },
        getPlatformInfo: (cb) => cb && cb({}),
        lastError: null
      },
      tabs: {}, debugger: {}, scripting: {}
    }
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['refrens-api.js', 'match.js', 'capture.js', 'background.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return (msg) => new Promise((resolve) => listeners[0](msg, {}, resolve));
}

const INVOICE = (n, client, total, due, status, date, currency = 'USD') => ({
  _id: `id-${n}`, invoiceNumber: n, currency, status, invoiceDate: date,
  totals: { total }, balance: { due, paid: total - due },
  billedTo: { name: client, country: 'US' }
});

const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body });

const PAYMENT = { amount: 650, currency: 'USD', payerName: 'Acme Holdings Inc', creditedAt: '2026-09-02T03:36:00Z' };
const results = [];
const check = (name, cond, detail) => { results.push({ name, ok: !!cond, detail }); };

(async () => {
  // 1. No credentials at all -> an immediate, actionable answer.
  {
    const send = makeWorker({ store: {}, fetchImpl: async () => { throw new Error('should not be called'); } });
    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('no credentials answers instead of hanging', res && res.ok === false, JSON.stringify(res));
    check('no credentials reports NEEDS_CONNECT', res.code === 'NEEDS_CONNECT', res.error);
  }

  // 2. The fast path: targeted probes, not a full download.
  {
    const all = [
      INVOICE('INV-0165', 'Acme Holdings', 650, 650, 'UNPAID', '2026-08-24'),
      INVOICE('INV-0161', 'Contoso Financials, Inc.', 7000, 0, 'PAID', '2026-07-26'),
      INVOICE('INV-0099', 'Acme Holdings', 650, 0, 'PAID', '2026-01-11'),
      INVOICE('INV-0062', 'Northwind Ltd', 800, 800, 'UNPAID', '2025-09-09')
    ];
    /* Applies the filters the extension actually sends, so a probe that asks the
       wrong question fails here rather than silently returning the ledger. */
    const serve = (url) => {
      const q = new URL(url).searchParams;
      let rows = all.slice();
      if (q.get('currency')) rows = rows.filter((i) => i.currency === q.get('currency'));
      const inStatus = q.getAll('status[$in][]');
      if (inStatus.length) rows = rows.filter((i) => inStatus.includes(i.status));
      for (const [field, path] of [['totals.total', (i) => i.totals.total], ['balance.due', (i) => i.balance.due]]) {
        const gte = q.get(`${field}[$gte]`), lte = q.get(`${field}[$lte]`);
        if (gte !== null) rows = rows.filter((i) => path(i) >= Number(gte));
        if (lte !== null) rows = rows.filter((i) => path(i) <= Number(lte));
      }
      const rx = q.get('billedTo.name[$regex]');
      if (rx) {
        const re = new RegExp(rx, q.get('billedTo.name[$options]') || '');
        rows = rows.filter((i) => re.test(i.billedTo.name));
      }
      return { rows, q };
    };

    const seen = [];
    const send = makeWorker({
      store: { sessionToken: 'tok', sessionTokenExp: Date.now() + 3.6e6, refrensUrlKey: 'your-business' },
      fetchImpl: async (url) => {
        const { rows, q } = serve(url);
        seen.push(q);
        return jsonRes({ total: rows.length, data: rows });
      }
    });

    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('fast path succeeds', res.ok === true, res.error);
    const d = res.data || {};
    check('ranks INV-0165 first', d.matches && d.matches[0].invoice.number === 'INV-0165',
      d.matches && d.matches[0] && d.matches[0].invoice.number);
    check('top match scores 100', d.matches[0].score === 100, String(d.matches[0].score));
    check('probes run in parallel, not paged', seen.length === 4, `${seen.length} requests`);
    check('candidates are deduped', new Set(d.candidates.map((c) => c.id)).size === d.candidates.length,
      `${d.candidates.length} rows`);
    check('candidate set stays small', d.candidates.length <= 4, `${d.candidates.length}`);
    check('trims fields with $select', seen[0].getAll('$select[]').includes('invoiceNumber'), 'no $select sent');
    check('payer regex drops the suffix', seen.some((q) => q.get('billedTo.name[$regex]') === 'acme.*holdings'),
      String(seen.map((q) => q.get('billedTo.name[$regex]')).filter(Boolean)));
    check('payer regex is case-insensitive', seen.some((q) => q.get('billedTo.name[$options]') === 'i'), 'no $options=i');
    check('builds a Refrens deep link', /refrens\.com\/app\/your-business\/invoices\//.test(d.candidates[0].appUrl),
      d.candidates[0].appUrl);
  }

  // 3. Browse is its own paged, searchable query.
  {
    let lastQ = null;
    const send = makeWorker({
      store: { sessionToken: 'tok', sessionTokenExp: Date.now() + 3.6e6, refrensUrlKey: 'your-business' },
      fetchImpl: async (url) => {
        lastQ = new URL(url).searchParams;
        return jsonRes({ total: 159, data: [INVOICE('INV-0165', 'Acme Holdings', 650, 650, 'UNPAID', '2026-08-24')] });
      }
    });
    const res = await send({ type: 'BROWSE', payment: PAYMENT, skip: 50, search: 'Acme' });
    check('browse succeeds', res.ok === true, res.error);
    check('browse reports the full total', res.data.total === 159, String(res.data.total));
    check('browse pages with $skip', lastQ.get('$skip') === '50', lastQ.get('$skip'));
    check('browse searches server-side', lastQ.get('$or[0][invoiceNumber][$regex]') === 'Acme',
      lastQ.get('$or[0][invoiceNumber][$regex]'));
    check('browse searches client names too', lastQ.get('$or[1][billedTo.name][$regex]') === 'Acme',
      lastQ.get('$or[1][billedTo.name][$regex]'));
  }

  // 4. One failing probe must not sink the rest.
  {
    let n = 0;
    const send = makeWorker({
      store: { sessionToken: 'tok', sessionTokenExp: Date.now() + 3.6e6, refrensUrlKey: 'your-business' },
      fetchImpl: async () => {
        if (++n === 1) throw new Error('socket hang up');
        return jsonRes({ total: 1, data: [INVOICE('INV-0165', 'Acme Holdings', 650, 650, 'UNPAID', '2026-08-24')] });
      }
    });
    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('survives a single failed probe', res.ok === true, res.error);
    check('still ranks the match', res.ok && res.data.matches[0].invoice.number === 'INV-0165', 'no match');
  }

  // 3. API keys -> exchanged for a JWT, then used as the bearer.
  {
    const seen = [];
    const send = makeWorker({
      store: { appId: 'app', appSecret: 'sec', refrensUrlKey: 'your-business' },
      fetchImpl: async (url, opts) => {
        const u = String(url); seen.push(u);
        if (u.endsWith('/authentication')) return jsonRes({ accessToken: 'exchanged-jwt' });
        check('bearer is the exchanged token', opts.headers.Authorization === 'Bearer exchanged-jwt', opts.headers.Authorization);
        return jsonRes({ total: 0, data: [] });
      }
    });
    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('api key path succeeds', res.ok === true, res.error);
    check('exchanges keys before querying', seen[0].endsWith('/authentication'), seen[0]);
    check('signs in once for all probes',
      seen.filter((u) => u.endsWith('/authentication')).length === 1,
      `${seen.filter((u) => u.endsWith('/authentication')).length} sign-ins`);
  }

  // 5. A total network failure surfaces as an error, never as a hang.
  {
    const send = makeWorker({
      store: { sessionToken: 'tok', sessionTokenExp: Date.now() + 3.6e6, refrensUrlKey: 'your-business' },
      fetchImpl: async () => { const e = new Error('socket hang up'); throw e; }
    });
    const res = await Promise.race([
      send({ type: 'FIND_MATCHES', payment: PAYMENT }),
      new Promise((r) => setTimeout(() => r('HUNG'), 5000))
    ]);
    check('network failure answers within 5s', res !== 'HUNG', 'still hanging');
    check('network failure names the step', res !== 'HUNG' && /Refrens invoice query/.test(res.error), res.error);
  }

  // 6. A 401 clears the cached token so the next attempt re-authenticates.
  {
    const store = { sessionToken: 'stale', sessionTokenExp: Date.now() + 3.6e6, refrensUrlKey: 'your-business' };
    const send = makeWorker({ store, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('401 reports NEEDS_CONNECT', res.code === 'NEEDS_CONNECT', res.error);
    check('401 drops the stale token', !store.sessionToken, JSON.stringify(store));
  }

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.ok ? '' : '→ ' + r.detail}`);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\nFAIL (${failed.length}/${results.length})` : `\nPASS (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})();
