/* Service worker: owns the pairing with app.activeset.co, the matching pass,
   and the PDF. The content scripts stay dumb on purpose — they render and
   inject, nothing more. */

importScripts('/src/refrens-api.js', '/src/match.js', '/src/capture.js');

/* An MV3 worker is torn down after ~30s idle, and plain fetch() does not count
   as activity — which is exactly how a slow request turned into "the message
   channel closed before a response was received". Touching a chrome.* API on a
   timer does count, so the worker survives long work. */
function keepAlive(promise) {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError), 20_000);
  return promise.finally(() => clearInterval(timer));
}

/* Turns raw invoice rows into the shape the panel renders. */
async function decorate(rows) {
  const { urlKey } = await pairingStatus();
  return rows.map((inv) => {
    const s = summarise(inv);
    s.appUrl = urlKey ? `https://www.refrens.com/app/${urlKey}/invoices/${s.id}` : null;
    return s;
  });
}

const handlers = {
  STATUS: () => pairingStatus(),

  async UNPAIR() {
    await clearPairing();
    return { ok: true };
  },

  /* Ask the server for the likely matches instead of downloading the ledger.
     Four parallel probes, ~350ms. */
  async FIND_MATCHES({ payment }) {
    const t0 = Date.now();
    const { rows, probes } = await findCandidates(payment);
    const invoices = await decorate(rows);
    console.debug(`[rsb] ${probes} probes returned ${invoices.length} candidates in ${Date.now() - t0}ms`);
    return { matches: rankMatches(invoices, payment), candidates: invoices, ms: Date.now() - t0 };
  },

  /* The browse tab, loaded only when it is opened. */
  async BROWSE({ payment, anyCurrency, skip = 0, search }) {
    const { rows, total } = await browseInvoices({
      currency: anyCurrency ? undefined : payment.currency,
      skip,
      search,
    });
    return { invoices: await decorate(rows), total, skip };
  },

  /* Always the real Refrens document — never a reconstruction. */
  async GET_PDF({ invoiceId }) {
    const inv = await getInvoice(invoiceId);
    const filename = pdfFileName(inv);
    const { preferHostedPdf = false } = await chrome.storage.local.get('preferHostedPdf');

    if (preferHostedPdf && inv.share && inv.share.pdf) {
      const hosted = await fetchHostedPdf(inv.share.pdf);
      if (hosted) return { bytes: Array.from(hosted), filename, source: 'hosted' };
    }

    if (!inv.share || !inv.share.link) {
      throw new Error(`Refrens did not return a shareable link for invoice ${inv.invoiceNumber || invoiceId}.`);
    }
    return { bytes: Array.from(await captureSharePdf(inv.share.link)), filename, source: 'captured' };
  },

  async OPEN_TOOLS() {
    const { apiBase } = await pairingStatus();
    await chrome.tabs.create({ url: `${apiBase}/modules/internal-tools`, active: true });
    return { ok: true };
  },
};

/* A backstop above the per-request network timeouts: whatever goes wrong, the
   panel gets an answer instead of spinning forever. */
const HANDLER_TIMEOUT_MS = 60_000;

function withTimeout(promise, label) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not finish within ${HANDLER_TIMEOUT_MS / 1000}s. See the service worker console for details.`)),
      HANDLER_TIMEOUT_MS
    );
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

let seq = 0;

function dispatch(msg, sendResponse) {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;

  const id = `${msg.type}#${++seq}`;
  const started = Date.now();
  console.debug(`[rsb] ${id} start`);

  withTimeout(keepAlive(Promise.resolve().then(() => handler(msg))), msg.type)
    .then((data) => {
      console.debug(`[rsb] ${id} ok in ${Date.now() - started}ms`);
      sendResponse({ ok: true, data });
    })
    .catch((err) => {
      console.error(`[rsb] ${id} failed after ${Date.now() - started}ms`, err);
      sendResponse({ ok: false, error: err.message || String(err), code: err.code || null });
    });

  return true; // keep the channel open for the async reply
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => dispatch(msg, sendResponse));

/* --------------------------------------------------------------------------
   Messages from app.activeset.co (allowed by externally_connectable).

   Two things only: answer "are you installed?" so the Internal Tools page can
   show real status, and accept a pairing token the page just minted for the
   signed-in person. Nothing else is reachable from a web page, and the token is
   only ever pushed in — the page cannot read one back out.
   -------------------------------------------------------------------------- */
const PAIRING_ORIGINS = ['https://app.activeset.co', 'http://localhost:3000'];

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const origin = sender.origin || (sender.url ? new URL(sender.url).origin : '');
  if (!PAIRING_ORIGINS.includes(origin)) {
    sendResponse({ ok: false, error: 'Origin not allowed' });
    return false;
  }

  if (msg && msg.type === 'PING') {
    sendResponse({
      ok: true,
      installed: true,
      version: chrome.runtime.getManifest().version,
      name: chrome.runtime.getManifest().name,
    });
    return false;
  }

  if (msg && msg.type === 'PAIR') {
    savePairing({
      token: msg.token,
      apiBase: msg.apiBase || origin,
      urlKey: msg.urlKey,
      pairedAs: msg.pairedAs,
    })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg && msg.type === 'UNPAIR') {
    clearPairing()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown message' });
  return false;
});

console.debug('[rsb] service worker ready');
