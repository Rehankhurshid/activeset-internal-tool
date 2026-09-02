/* Service worker: owns the Refrens credentials, the matching pass, and the PDF.
   The content scripts stay dumb on purpose -- they render and inject, nothing more. */

importScripts('/src/refrens-api.js', '/src/match.js', '/src/capture.js');

/* An MV3 worker is torn down after ~30s idle, and plain fetch() does not count
   as activity -- which is exactly how a slow Refrens page load turned into
   "the message channel closed before a response was received". Touching a
   chrome.* API on a timer does count, so the worker survives long work. */
function keepAlive(promise) {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError), 20_000);
  return promise.finally(() => clearInterval(timer));
}

/* Turns raw Refrens rows into the shape the panel renders. */
async function decorate(rows) {
  const { urlKey } = await requireAuth();
  return rows.map((inv) => {
    const s = summarise(inv);
    s.appUrl = `https://www.refrens.com/app/${urlKey}/invoices/${s.id}`;
    return s;
  });
}

const handlers = {
  /* A Refrens tab hands us its session token; sessionStorage is per-tab, so this
     is the only place it can come from. Ignored once API keys are configured. */
  async REFRENS_TOKEN({ token, urlKey }) {
    await saveSession({ token, urlKey });
    return { ok: true };
  },

  STATUS: () => authStatus(),

  /* Ask Refrens for the likely matches instead of downloading the ledger and
     sifting it here. Four parallel probes, ~350ms, ~14KB. */
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
      search
    });
    return { invoices: await decorate(rows), total, skip };
  },

  /* Always the real Refrens document -- never a reconstruction. */
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

  async OPEN_SETTINGS() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },

  async OPEN_REFRENS() {
    const { refrensUrlKey } = await chrome.storage.local.get('refrensUrlKey');
    await chrome.tabs.create({
      url: refrensUrlKey ? `https://www.refrens.com/app/${refrensUrlKey}` : 'https://www.refrens.com/app',
      active: true
    });
    return { ok: true };
  }
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;

  const id = `${msg.type}#${++seq}`;
  const started = Date.now();
  console.debug(`[rsb] ${id} start`, msg);

  withTimeout(keepAlive(Promise.resolve().then(() => handler(msg))), msg.type)
    .then((data) => {
      console.debug(`[rsb] ${id} ok in ${Date.now() - started}ms`, data);
      sendResponse({ ok: true, data });
    })
    .catch((err) => {
      console.error(`[rsb] ${id} failed after ${Date.now() - started}ms`, err);
      sendResponse({ ok: false, error: err.message || String(err), code: err.code || null });
    });

  return true; // keep the channel open for the async reply
});

console.debug('[rsb] service worker ready');
