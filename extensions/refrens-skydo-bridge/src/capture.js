/* Gets the real Refrens invoice PDF.

   The Refrens API has no PDF endpoint -- create, find, get and cancel are the
   whole documented surface. The undocumented `share.pdf` link on og.refrens.com
   encodes an internal print host that is currently answering 404, which is also
   why Refrens' own Download button fails right now.

   So we capture Refrens' own rendered invoice instead. `share.link` is a
   self-authenticating view of the real document -- their template, logo, bank
   block, signature -- and it carries its own token, so the tab needs no session.
   We open it off-screen, let Refrens' print stylesheet strip the app chrome
   (they already tag it .no-print / .no-pdf), and ask Chrome for the same PDF the
   browser's own "Save as PDF" would produce: real vector text, not a screenshot.

   Page.printToPDF is only reachable through the debugger API, which is why the
   extension asks for that permission and why Chrome shows a debugging banner on
   the hidden tab while it works. */

const CAPTURE_TIMEOUT_MS = 25_000;
const REMOTE_PDF_TIMEOUT_MS = 8_000;

const cdp = (target, method, params) => chrome.debugger.sendCommand(target, method, params);

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isPdf = (bytes) => String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';

function waitForTabComplete(tabId, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Refrens invoice page did not finish loading.')); }, timeout);
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') { cleanup(); resolve(); } };
    const cleanup = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpdated); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') { cleanup(); resolve(); } }).catch(() => {});
  });
}

/* Refrens renders the invoice client-side, so "load" is not "painted". Wait for
   the invoice container and for its images -- logo and signature -- to decode,
   otherwise the PDF comes out with holes where they should be. */
async function waitForInvoicePainted(target, deadline) {
  const expression = `(() => {
    const page = document.querySelector('.invoice-page');
    if (!page || page.offsetHeight < 200) return false;
    return [...document.images].every(img => !img.src || img.complete);
  })()`;
  for (;;) {
    const { result } = await cdp(target, 'Runtime.evaluate', { expression, returnByValue: true });
    if (result && result.value) return;
    if (Date.now() > deadline) throw new Error('Refrens invoice did not render in time.');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function captureSharePdf(shareLink) {
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
  const tab = await chrome.tabs.create({ url: shareLink, active: false });
  const target = { tabId: tab.id };
  let attached = false;

  try {
    await waitForTabComplete(tab.id);
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    await cdp(target, 'Page.enable');
    await cdp(target, 'Runtime.enable');

    try {
      await waitForInvoicePainted(target, Math.min(deadline, Date.now() + 8000));
    } catch (first) {
      // Chrome throttles background tabs, which can stall a client-rendered page.
      // Surfacing it briefly is enough to let the render finish.
      await chrome.tabs.update(tab.id, { active: true });
      await waitForInvoicePainted(target, deadline);
    }

    // Refrens tags its own app chrome; Crisp is a third-party widget that has no
    // print rule of its own, so name it explicitly.
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      css: `.no-print, .no-pdf, #crisp-chatbox, .crisp-client, [id^="crisp-"] { display: none !important; }
            html, body { background: #fff !important; }`
    });

    const { data } = await cdp(target, 'Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,   // honour Refrens' own @page rules when they set them
      paperWidth: 8.27,          // A4 fallback, in inches
      paperHeight: 11.69,
      marginTop: 0.2, marginBottom: 0.2, marginLeft: 0.2, marginRight: 0.2,
      transferMode: 'ReturnAsBase64'
    });

    const bytes = b64ToBytes(data);
    if (!isPdf(bytes)) throw new Error('Chrome returned something that was not a PDF.');
    return bytes;
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch { /* tab may be gone */ } }
    try { await chrome.tabs.remove(tab.id); } catch { /* already closed */ }
  }
}

/* Refrens' hosted renderer. Currently broken, so it is opt-in and verified by
   magic bytes -- it answers 404 with an HTML error page, not an error status
   we can trust. */
async function fetchHostedPdf(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REMOTE_PDF_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return isPdf(bytes) ? bytes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pdfFileName(inv) {
  if (inv.share && inv.share.fileName) return `${inv.share.fileName}.pdf`;
  const slug = ['invoice', inv.invoiceNumber, inv.billedTo && inv.billedTo.name]
    .filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'invoice'}.pdf`;
}
