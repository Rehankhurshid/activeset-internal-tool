/* Runs on dashboard.skydo.com. On an unmapped-payment page it adds a panel that
   ranks Refrens invoices against the payment, lets you browse and filter every
   invoice, previews the real Refrens PDF, and drops it into Skydo's own upload
   input.

   It deliberately stops at "file attached". Mapping a payment moves money
   against an invoice, so the confirm step stays in Skydo's UI where the user
   can see exactly what they are agreeing to. */

const PANEL_ID = 'rsb-panel';

const money = (n, cur) =>
  `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (d) => {
  const t = Date.parse(d);
  return t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const outstanding = (inv) => (inv.due > 0 ? inv.due : inv.total);

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || !res.ok) {
        const e = new Error((res && res.error) || 'Extension error');
        e.code = res && res.code;
        return reject(e);
      }
      resolve(res.data);
    });
  });
}

const fundingIdFromUrl = () => (location.pathname.match(/\/unmapped-payment\/(\d+)/) || [])[1] || null;

/* ---------------------------------------------------------------- payment ---
   Prefer Skydo's own endpoint; fall back to the labelled blocks on the page so
   the panel still works if that endpoint changes shape. */
async function readPayment(fundingId) {
  try {
    const url = new URL('/api/funding-invoice-mapping', location.origin);
    url.searchParams.set('fundingId', fundingId);
    const json = await (await fetch(url, { credentials: 'include' })).json();
    const f = json && json.data && json.data.fundingDetails;
    if (f) {
      return {
        fundingId,
        currency: f.currency,
        amount: Number(f.amount || 0) - Number(f.amountMapped || 0),
        payerName: f.senderName || (f.payerLabel && f.payerLabel.name) || '',
        creditedAt: f.creditedAt,
        source: 'api'
      };
    }
  } catch { /* fall through to the DOM */ }
  return readPaymentFromDom(fundingId);
}

function labelledValue(label) {
  const node = [...document.querySelectorAll('div,p,span')]
    .find((el) => el.children.length === 0 && el.textContent.trim().toLowerCase() === label.toLowerCase());
  if (!node || !node.parentElement) return '';
  const text = node.parentElement.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
  const i = text.findIndex((t) => t.toLowerCase() === label.toLowerCase());
  return i >= 0 && text[i + 1] ? text[i + 1] : '';
}

function readPaymentFromDom(fundingId) {
  const m = labelledValue('Unmapped amount').match(/([A-Z]{3})\s*([\d,.]+)/);
  return {
    fundingId,
    currency: m ? m[1] : 'USD',
    amount: m ? Number(m[2].replace(/,/g, '')) : 0,
    payerName: labelledValue('Payer name'),
    creditedAt: labelledValue('Received on'),
    source: 'dom'
  };
}

/* ------------------------------------------------------------------ upload ---
   Skydo mounts its hidden file inputs only after the upload modal opens, so
   open it first, then wait for the input to appear. */
const findFileInput = () =>
  [...document.querySelectorAll('input[type=file]')].find((i) => (i.accept || '').includes('pdf')) || null;

function clickUploadButton() {
  const btn = [...document.querySelectorAll('button')]
    .find((b) => /^upload( invoice)?$/i.test(b.textContent.trim()));
  if (btn) btn.click();
  return !!btn;
}

async function waitFor(fn, { timeout = 6000, step = 120 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

async function attachPdf(file) {
  let input = findFileInput();
  if (!input) {
    if (!clickUploadButton()) throw new Error('Could not find Skydo\'s "Upload invoice" button on this page.');
    input = await waitFor(findFileInput);
  }
  if (!input) throw new Error('Skydo\'s upload dialog did not expose a file input.');

  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  // React listens for the bubbling change event on file inputs.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/* -------------------------------------------------------------------- state --- */
const blank = () => ({
  payment: null,
  matches: [], candidates: [], ms: 0, loaded: false,
  // The browse tab is a separate, lazily loaded page of the ledger.
  browse: { rows: [], total: 0, skip: 0, loaded: false, loading: false },
  tab: 'matches', query: '', outstandingOnly: false, anyCurrency: false,
  selected: null, pdf: null, busy: false, busyLabel: '', slow: false,
  error: null, errorCode: null
});
let state = blank();

/* The server already applied the search term; this only re-applies it locally so
   typing feels instant while the request is still in flight. */
function visibleInvoices() {
  const q = state.query.trim().toLowerCase();
  return state.browse.rows.filter((inv) => {
    if (state.outstandingOnly && !(inv.due > 0)) return false;
    if (!q) return true;
    return `${inv.number} ${inv.clientName} ${inv.status}`.toLowerCase().includes(q);
  });
}

/* --------------------------------------------------------------------- UI --- */
function render() {
  const el = document.getElementById(PANEL_ID);
  if (!el) return;
  const p = state.payment;
  const body = el.querySelector('.rsb-body');

  // A full re-render blows away focus; remember where the caret was.
  const active = document.activeElement;
  const keepFocus = active && active.id === 'rsb-q' ? active.selectionStart : null;

  const list = visibleInvoices();

  body.innerHTML = `
    ${p ? `
      <section class="rsb-payment">
        <div class="rsb-eyebrow">Skydo payment</div>
        <div class="rsb-amount">${esc(money(p.amount, p.currency))}</div>
        <dl class="rsb-kv">
          <div><dt>Payer</dt><dd>${esc(p.payerName || '—')}</dd></div>
          <div><dt>Received</dt><dd>${esc(p.source === 'api' ? shortDate(p.creditedAt) : p.creditedAt || '—')}</dd></div>
        </dl>
      </section>` : ''}

    ${state.error ? `<div class="rsb-error">${esc(state.error)}${
      state.errorCode === 'NEEDS_CONNECT'
        ? ' <button class="rsb-link" data-act="connect">Open Internal Tools</button>'
        : ''
    }</div>` : ''}

    ${state.slow ? `<div class="rsb-warn">
      Still waiting on Refrens. It gives up on its own — nothing here hangs forever.
      For detail: right-click the extension icon → <b>Inspect service worker</b> and read the console.
    </div>` : ''}

    ${!state.loaded ? `
      <button class="rsb-btn rsb-btn-primary" data-act="find" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? esc(state.busyLabel || 'Matching…') : 'Match against Refrens'}
      </button>` : `
      <nav class="rsb-tabs">
        <button class="${state.tab === 'matches' ? 'on' : ''}" data-act="tab" data-tab="matches">
          Suggested <span>${state.matches.length}</span>
        </button>
        <button class="${state.tab === 'all' ? 'on' : ''}" data-act="tab" data-tab="all">
          Browse${state.browse.total ? ` <span>${state.browse.total}</span>` : ''}
        </button>
      </nav>

      ${state.tab === 'all' ? `
        <div class="rsb-filters">
          <input id="rsb-q" type="search" placeholder="Search Refrens by invoice no. or client…" value="${esc(state.query)}">
          <div class="rsb-chips">
            <button class="rsb-chip ${state.outstandingOnly ? 'on' : ''}" data-act="chip" data-chip="outstanding">Outstanding only</button>
            <button class="rsb-chip ${state.anyCurrency ? 'on' : ''}" data-act="chip" data-chip="currency">
              ${state.anyCurrency ? 'All currencies' : esc(p.currency) + ' only'}
            </button>
          </div>
        </div>` : ''}

      ${state.tab === 'matches' ? renderMatches(p) : renderAll(list, p)}
    `}

    ${state.pdf ? `
      <section class="rsb-preview">
        <div class="rsb-eyebrow">
          Invoice preview
          <span class="rsb-tag rsb-tag-ok">${state.pdf.source === 'hosted' ? 'Refrens PDF service' : 'from Refrens'}</span>
        </div>
        <iframe class="rsb-frame" src="${state.pdf.url}"></iframe>
        <button class="rsb-btn rsb-btn-primary" data-act="attach">Attach ${esc(state.pdf.filename)} to Skydo</button>
        <p class="rsb-note">Skydo's own dialog opens next — review it there and confirm the mapping yourself.</p>
      </section>` : ''}
  `;

  if (keepFocus !== null) {
    const q = body.querySelector('#rsb-q');
    if (q) { q.focus(); q.setSelectionRange(keepFocus, keepFocus); }
  }
}

function renderMatches(p) {
  if (!state.matches.length) {
    return `<p class="rsb-empty">No invoice in Refrens looks like this payment. Try <b>Browse</b>.</p>`;
  }
  return `
    <div class="rsb-eyebrow rsb-plain">
      ${state.candidates.length} candidate${state.candidates.length === 1 ? '' : 's'} from Refrens in ${state.ms} ms
    </div>
    <ul class="rsb-matches">${state.matches.map((m, i) => matchCard(m, i, p)).join('')}</ul>`;
}

function renderAll(list, p) {
  if (state.browse.loading && !list.length) return `<p class="rsb-empty">Searching Refrens…</p>`;
  if (!list.length) return `<p class="rsb-empty">Nothing in Refrens matches those filters.</p>`;
  const more = state.browse.rows.length < state.browse.total;
  return `
    <div class="rsb-eyebrow rsb-plain">
      showing ${list.length} of ${state.browse.total} matching in Refrens
    </div>
    <ul class="rsb-matches">${list.map((inv) => invoiceCard(inv, p)).join('')}</ul>
    ${more ? `<button class="rsb-btn rsb-btn-ghost rsb-wide" data-act="more" ${state.browse.loading ? 'disabled' : ''}>
      ${state.browse.loading ? 'Loading…' : 'Load 50 more'}
    </button>` : ''}`;
}

/* A row is the same object in both tabs; only the badges and the detail differ. */
function row(inv, badge, trailing, extra) {
  return `
    <li class="rsb-match ${state.selected === inv.id ? 'rsb-match-on' : ''}">
      <button class="rsb-match-head" data-act="select" data-id="${esc(inv.id)}">
        ${badge}
        <span class="rsb-match-main">
          <span class="rsb-match-title">${esc(inv.number || 'Untitled')} · ${esc(inv.clientName || '—')}</span>
          <span class="rsb-match-sub">
            ${esc(money(outstanding(inv), inv.currency))} · ${esc(shortDate(inv.invoiceDate))} · ${esc(inv.status)}
          </span>
        </span>
        ${trailing}
      </button>
      <div class="rsb-why">
        ${extra}
        <div class="rsb-actions">
          <a class="rsb-link" href="${esc(inv.appUrl)}" target="_blank" rel="noreferrer">Open in Refrens ↗</a>
          <button class="rsb-btn rsb-btn-ghost" data-act="preview" data-id="${esc(inv.id)}" ${state.busy ? 'disabled' : ''}>
            ${state.busy && state.selected === inv.id ? 'Fetching…' : 'Get invoice PDF'}
          </button>
        </div>
      </div>
    </li>`;
}

function matchCard(m, i, payment) {
  const inv = m.invoice;
  const delta = payment.amount - outstanding(inv);
  const badge = `<span class="rsb-rank">${i + 1}</span>`;
  const score = `<span class="rsb-score ${m.score >= 90 ? 'rsb-score-hi' : m.score >= 60 ? 'rsb-score-mid' : ''}">${m.score}</span>`;
  const why = `
    <ul>
      ${m.reasons.map((r) => `<li class="${r.ok ? 'ok' : 'no'}"><span class="rsb-why-label">${esc(r.label)}</span> ${esc(r.detail)}</li>`).join('')}
    </ul>
    <div class="rsb-delta">
      Payment ${esc(money(payment.amount, payment.currency))} vs invoice ${esc(money(outstanding(inv), inv.currency))}
      ${Math.abs(delta) < 0.005 ? '<b class="ok">— exact</b>'
        : `<b class="no">— ${esc(money(Math.abs(delta), inv.currency))} ${delta > 0 ? 'over' : 'short'}</b>`}
    </div>`;
  return row(inv, badge, score, why);
}

function invoiceCard(inv, payment) {
  const delta = payment.amount - outstanding(inv);
  const sameCur = inv.currency === payment.currency;
  const badge = `<span class="rsb-rank rsb-rank-plain">${esc(inv.currency)}</span>`;
  const note = !sameCur
    ? `<div class="rsb-delta"><b class="no">Different currency</b> — invoice is in ${esc(inv.currency)}, payment in ${esc(payment.currency)}.</div>`
    : `<div class="rsb-delta">
         Payment ${esc(money(payment.amount, payment.currency))} vs invoice ${esc(money(outstanding(inv), inv.currency))}
         ${Math.abs(delta) < 0.005 ? '<b class="ok">— exact</b>'
           : `<b class="no">— ${esc(money(Math.abs(delta), inv.currency))} ${delta > 0 ? 'over' : 'short'}</b>`}
       </div>`;
  return row(inv, badge, '', note);
}

/* ----------------------------------------------------------------- actions --- */
async function busy(label, fn) {
  state.busy = true; state.busyLabel = label; state.error = null; state.slow = false; render();
  const slowTimer = setTimeout(() => { state.slow = true; render(); }, 12_000);
  try { await fn(); }
  catch (e) { state.error = e.message; state.errorCode = e.code; }
  finally {
    clearTimeout(slowTimer);
    state.busy = false; state.busyLabel = ''; state.slow = false; render();
  }
}

const onFind = () => busy('Matching…', async () => {
  const status = await send('STATUS');
  if (!status.connected) {
    const e = new Error('This browser is not paired yet. Open Internal Tools on app.activeset.co and click "Pair with this browser".');
    e.code = 'NEEDS_CONNECT';
    throw e;
  }
  const { matches, candidates, ms } = await send('FIND_MATCHES', { payment: state.payment });
  Object.assign(state, { matches, candidates, ms, loaded: true });
  state.selected = matches.length ? matches[0].invoice.id : null;
  if (!matches.length) { state.tab = 'all'; loadBrowse({ reset: true }); }
});

/* The browse tab is its own paged query, fetched the first time it is opened and
   re-fetched when the search term or currency filter changes. */
async function loadBrowse({ reset = false } = {}) {
  const b = state.browse;
  if (b.loading) return;
  b.loading = true;
  if (reset) { b.rows = []; b.skip = 0; }
  state.error = null;
  render();
  try {
    const { invoices, total } = await send('BROWSE', {
      payment: state.payment,
      anyCurrency: state.anyCurrency,
      skip: b.skip,
      search: state.query
    });
    const seen = new Set(b.rows.map((i) => i.id));
    b.rows = [...b.rows, ...invoices.filter((i) => !seen.has(i.id))];
    b.total = total;
    b.skip = b.rows.length;
    b.loaded = true;
  } catch (e) {
    state.error = e.message; state.errorCode = e.code;
  } finally {
    b.loading = false;
    render();
  }
}

const onMore = () => loadBrowse();

/* Typing re-queries Refrens, but only once the user pauses. */
let searchTimer = null;
function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadBrowse({ reset: true }), 300);
}

const onPreview = (invoiceId) => {
  state.selected = invoiceId;
  return busy('Fetching…', async () => {
    const { bytes, filename, source } = await send('GET_PDF', { invoiceId });
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    if (state.pdf) URL.revokeObjectURL(state.pdf.url);
    state.pdf = { url: URL.createObjectURL(blob), file: new File([blob], filename, { type: 'application/pdf' }), filename, source };
  });
};

async function onAttach() {
  try { await attachPdf(state.pdf.file); state.error = null; }
  catch (e) { state.error = e.message; }
  render();
}

function mount() {
  if (document.getElementById(PANEL_ID)) return;
  const el = document.createElement('aside');
  el.id = PANEL_ID;
  el.innerHTML = `
    <header class="rsb-head">
      <span class="rsb-logo">R→S</span>
      <span class="rsb-title">Refrens invoice match</span>
      <button class="rsb-collapse" data-act="collapse" title="Collapse">–</button>
    </header>
    <div class="rsb-body"></div>`;
  document.body.appendChild(el);

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const { act, id, tab, chip } = t.dataset;
    if (act === 'collapse') el.classList.toggle('rsb-min');
    if (act === 'find') onFind();
    if (act === 'more') onMore();
    if (act === 'tab') {
      state.tab = tab;
      render();
      if (tab === 'all' && !state.browse.loaded) loadBrowse({ reset: true });
    }
    if (act === 'select') { state.selected = state.selected === id ? null : id; render(); }
    if (act === 'preview') onPreview(id);
    if (act === 'attach') onAttach();
    if (act === 'connect') send('OPEN_TOOLS');
    if (act === 'chip') {
      if (chip === 'outstanding') { state.outstandingOnly = !state.outstandingOnly; render(); }
      // Currency is a server-side filter, so flipping it means refetching.
      if (chip === 'currency') {
        state.anyCurrency = !state.anyCurrency;
        render();
        loadBrowse({ reset: true });
      }
    }
  });

  el.addEventListener('input', (e) => {
    if (e.target.id !== 'rsb-q') return;
    state.query = e.target.value;
    render();          // local filter is instant
    scheduleSearch();  // then Refrens answers for rows not yet loaded
  });
}

function teardown() {
  const el = document.getElementById(PANEL_ID);
  if (el) el.remove();
  if (state.pdf) URL.revokeObjectURL(state.pdf.url);
  state = blank();
}

async function sync() {
  const id = fundingIdFromUrl();
  if (!id) return teardown();
  if (state.payment && state.payment.fundingId === id) return;
  teardown();
  mount();
  state.payment = await readPayment(id);
  render();
  onFind(); // ~350ms — no reason to make the user ask for it
}

// Skydo is a client-side router, so poll for URL changes rather than relying on load.
let lastUrl = '';
setInterval(() => {
  if (location.href !== lastUrl) { lastUrl = location.href; sync(); }
}, 700);
sync();
