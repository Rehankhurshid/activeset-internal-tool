/* Drives the service worker's message plumbing outside Chrome.

   The extension no longer holds Refrens credentials — it calls the ActiveSet
   proxy with a per-person pairing token. These checks pin the properties that
   matter about that: it never reaches api.refrens.com, it sends the pairing
   token, an unpaired browser gets told so instead of hanging, a revoked token
   clears the pairing, and only allowlisted origins can pair it. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');

function makeWorker({ store = {}, fetchImpl, seenUrls = [] }) {
  const listeners = [];
  const externalListeners = [];
  const ctx = {
    console: { debug() {}, error() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, URLSearchParams, AbortController, Promise, JSON, Math, Date, Object, Array,
    String, Number, Error, Set, Map, RegExp, Buffer,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    fetch: (url, opts) => { seenUrls.push(String(url)); return fetchImpl(url, opts); },
    importScripts: () => {},
    chrome: {
      storage: { local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async (patch) => Object.assign(store, patch),
        remove: async (keys) => [].concat(keys).forEach((k) => delete store[k]),
      } },
      runtime: {
        onMessage: { addListener: (fn) => listeners.push(fn) },
        onMessageExternal: { addListener: (fn) => externalListeners.push(fn) },
        getPlatformInfo: (cb) => cb && cb({}),
        getManifest: () => ({ version: '3.0.0', name: 'Refrens → Skydo Invoice Bridge' }),
        lastError: null,
      },
      tabs: {}, debugger: {}, scripting: {},
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['refrens-api.js', 'match.js', 'capture.js', 'background.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return {
    send: (msg) => new Promise((r) => listeners[0](msg, {}, r)),
    sendExternal: (msg, sender) => new Promise((r) => externalListeners[0](msg, sender, r)),
    store,
  };
}

const INVOICE = (n, client, total, due, status, date, currency = 'USD') => ({
  _id: `id-${n}`, invoiceNumber: n, currency, status, invoiceDate: date,
  totals: { total }, balance: { due, paid: total - due },
  billedTo: { name: client, country: 'US' },
});
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const PAYMENT = { amount: 650, currency: 'USD', payerName: 'Acme Holdings Inc', creditedAt: '2026-09-02T03:36:00Z' };
const PAIRED = { extToken: 'tok-123', apiBase: 'https://app.activeset.co', refrensUrlKey: 'acme', pairedAs: 'a@activeset.co' };

const results = [];
const check = (name, cond, detail) => results.push({ name, ok: !!cond, detail });

(async () => {
  // 1. Unpaired -> an immediate, actionable answer rather than a hang.
  {
    const { send } = makeWorker({ store: {}, fetchImpl: async () => { throw new Error('must not be called'); } });
    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('unpaired answers instead of hanging', res && res.ok === false, JSON.stringify(res));
    check('unpaired reports NEEDS_CONNECT', res.code === 'NEEDS_CONNECT', res.error);
  }

  // 2. Paired -> goes to the app proxy, never to Refrens, with the pairing token.
  {
    const seenUrls = [];
    const seenAuth = [];
    const all = [
      INVOICE('INV-0165', 'Acme Holdings', 650, 650, 'UNPAID', '2026-08-24'),
      INVOICE('INV-0099', 'Acme Holdings', 650, 0, 'PAID', '2026-01-11'),
    ];
    const { send } = makeWorker({
      store: { ...PAIRED },
      seenUrls,
      fetchImpl: async (url, opts) => {
        seenAuth.push(opts.headers.Authorization);
        const q = new URL(url).searchParams;
        let rows = all.slice();
        const gte = q.get('totals.total[$gte]'), lte = q.get('totals.total[$lte]');
        if (gte) rows = rows.filter((i) => i.totals.total >= +gte && i.totals.total <= +lte);
        const inStatus = q.getAll('status[$in][]');
        if (inStatus.length) rows = rows.filter((i) => inStatus.includes(i.status));
        const rx = q.get('billedTo.name[$regex]');
        if (rx) rows = rows.filter((i) => new RegExp(rx, 'i').test(i.billedTo.name));
        return jsonRes({ total: rows.length, data: rows });
      },
    });

    const res = await send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('paired fast path succeeds', res.ok === true, res.error);
    check('never calls Refrens directly', !seenUrls.some((u) => u.includes('api.refrens.com')), seenUrls[0]);
    check('calls the app proxy', seenUrls.every((u) => u.includes('/api/extension/refrens/invoices')), seenUrls[0]);
    check('sends the pairing token', seenAuth.every((a) => a === 'Bearer tok-123'), String(seenAuth[0]));
    check('runs four parallel probes', seenUrls.length === 4, `${seenUrls.length} requests`);
    check('ranks the outstanding invoice first',
      res.data.matches[0].invoice.number === 'INV-0165', res.data.matches[0]?.invoice.number);
    check('deep-links using the paired urlKey',
      /refrens\.com\/app\/acme\/invoices\//.test(res.data.candidates[0].appUrl), res.data.candidates[0].appUrl);
  }

  // 3. A revoked token clears the pairing so the panel prompts to re-pair.
  {
    const w = makeWorker({ store: { ...PAIRED }, fetchImpl: async () => jsonRes({ error: 'revoked' }, 401) });
    const res = await w.send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('401 reports NEEDS_CONNECT', res.code === 'NEEDS_CONNECT', res.error);
    check('401 clears the stored pairing', !w.store.extToken, JSON.stringify(w.store));
  }

  // 4. Losing module access is reported, not silently retried.
  {
    const w = makeWorker({
      store: { ...PAIRED },
      fetchImpl: async () => jsonRes({ error: 'Access to the invoices module has been removed' }, 403),
    });
    const res = await w.send({ type: 'FIND_MATCHES', payment: PAYMENT });
    check('403 surfaces the access message', /invoices module/.test(res.error || ''), res.error);
    check('403 keeps the token (access may be restored)', !!w.store.extToken, 'token was cleared');
  }

  // 5. Pairing is accepted only from the app's own origins.
  {
    const w = makeWorker({ store: {}, fetchImpl: async () => jsonRes({}) });
    const ping = await w.sendExternal({ type: 'PING' }, { origin: 'https://app.activeset.co' });
    check('answers PING from the app', ping.ok === true && ping.installed === true, JSON.stringify(ping));
    check('PING reports its version', ping.version === '3.0.0', ping.version);

    const paired = await w.sendExternal(
      { type: 'PAIR', token: 't', apiBase: 'https://app.activeset.co', urlKey: 'acme', pairedAs: 'a@activeset.co' },
      { origin: 'https://app.activeset.co' }
    );
    check('accepts pairing from the app', paired.ok === true, JSON.stringify(paired));
    check('stores the pairing token', w.store.extToken === 't', JSON.stringify(w.store));

    const evil = await w.sendExternal({ type: 'PAIR', token: 'evil' }, { origin: 'https://evil.example.com' });
    check('rejects pairing from another origin', evil.ok === false, JSON.stringify(evil));
    check('hostile origin cannot overwrite the token', w.store.extToken === 't', w.store.extToken);

    const read = await w.sendExternal({ type: 'STATUS' }, { origin: 'https://app.activeset.co' });
    check('the page cannot read the token back out', read.ok === false, JSON.stringify(read));
  }

  // 6. A network failure surfaces as an error, never as a hang.
  {
    const { send } = makeWorker({
      store: { ...PAIRED },
      fetchImpl: async () => { throw new Error('socket hang up'); },
    });
    const res = await Promise.race([
      send({ type: 'FIND_MATCHES', payment: PAYMENT }),
      new Promise((r) => setTimeout(() => r('HUNG'), 5000)),
    ]);
    check('network failure answers within 5s', res !== 'HUNG', 'still hanging');
    check('network failure names the step', res !== 'HUNG' && /ActiveSet/.test(res.error), res.error);
  }

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(width)}  ${r.ok ? '' : '→ ' + r.detail}`);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\nFAIL (${failed.length}/${results.length})` : `\nPASS (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})();
