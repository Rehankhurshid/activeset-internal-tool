# Refrens → Skydo Invoice Bridge

A Chrome extension (MV3) that sits on Skydo's **Unmapped payments** page, ranks your
Refrens invoices against the payment, shows you *why* each one matched, and puts **the
real Refrens invoice PDF** into Skydo's upload box — no downloading and re-uploading.

The uploaded file is Refrens' own document: your ActiveSet template, logo, bank block
and signature. Nothing is regenerated or reconstructed.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `refrens-skydo-bridge` folder
3. Connect Refrens (either one):
   - **API keys** *(recommended)* — Refrens → Settings → Integrations → *Enable Refrens
     Invoices API* → **Generate API Keys**. Paste the App ID, App Secret and your business
     URL key into the extension's Settings. Works with no Refrens tab open.
   - **Nothing at all** — just open your Refrens dashboard in a tab and the extension
     borrows that session.
4. Open a Skydo unmapped payment: `https://dashboard.skydo.com/unmapped-payment/<id>`

## How it works

| Step | What happens |
|---|---|
| Read the payment | `GET /api/funding-invoice-mapping?fundingId=…` on Skydo (same-origin, your cookies). Falls back to the labelled blocks on the page. |
| Authenticate | None locally. The extension holds a per-person pairing token issued by app.activeset.co and sends it as a bearer; the server authenticates to Refrens with its own signing key. |
| Find the candidates | Four targeted queries in parallel — see below. Runs automatically as soon as the page opens. |
| Rank | Currency is a hard filter. Then amount (exact / within 2% for bank charges / partial), payer-vs-client name similarity, outstanding balance, and how close the invoice date is to the credit date. Every rule prints its reasoning into the panel. |
| Browse | A second tab, loaded only when opened: server-side search over invoice number *and* client name, an *Outstanding only* filter, an all-currencies toggle, and 50-at-a-time paging — for when you'd rather pick it yourself. |
| Fetch the PDF | See below — the real Refrens document. |
| Preview | Shows that PDF in the panel so you can check it against the payment. |
| Attach | Opens Skydo's own upload dialog and sets the file on its hidden `<input type=file>`. |

### Asking, not downloading

Refrens is Feathers-backed, so the query string does the work: nested paths
(`totals.total`), operators (`$gte`, `$in`, `$regex`, `$or`) and `$select` all execute
server-side. That turns matching from a download into a lookup:

| | before | now |
|---|---|---|
| requests | 4, sequential | 4, parallel |
| transferred | ~2.5 MB | ~14 KB |
| wall clock | seconds | ~350 ms |

Two things carry it. `$select` trims a 25 KB invoice document to about 1 KB — listing 50
invoices costs 9 KB instead of 2.5 MB. And the match is *asked for* rather than
fetched-then-filtered; the four probes are:

1. `totals.total` within ±3% of the payment — the invoice as raised
2. `balance.due` within ±3% — what is still owed, for part-paid invoices
3. `status[$in]=UNPAID,PARTIALLY_PAID` — everything outstanding (often only a handful)
4. `billedTo.name[$regex]` built from the payer, suffixes dropped — `Acme Holdings Inc`
   becomes `fire.*aside`

The ±3% band is what catches payments shaved by bank charges, which an exact-amount
lookup would miss entirely. Results are deduped by id and ranked together. `$regex` is
case-sensitive unless `$options=i` is sent, and `$search` is rejected outright — both
found the hard way.

Probes run under `Promise.allSettled`, so one dead request degrades the candidate set
instead of failing the match. The API-key exchange is single-flighted, or four
concurrent probes would each sign in separately.

The service worker is kept alive with a `chrome.runtime` ping while it works — an MV3
worker is torn down after ~30 s idle and plain `fetch` does not count as activity, which
otherwise surfaces as *"the message channel closed before a response was received"*.

**It stops at "file attached" on purpose.** Mapping a payment moves money against an
invoice, so the confirm step stays in Skydo's UI where you can see what you're agreeing to.

## Getting the real PDF

The Refrens API has **no PDF endpoint** — create, find, get and cancel are the whole
documented surface. There are two undocumented ways to the document, and the extension
uses the one that works:

1. **`share.pdf`** (`og.refrens.com`) — the link Refrens' own Download button opens.
   It encodes an internal print host of theirs that currently
   answers **404 after a ~30 s timeout**, reproduced across several invoices. Refrens'
   own Download / Print → Download is broken for the same reason. Left in as an opt-in
   toggle for when they fix it; the response is checked for `%PDF-` magic bytes because
   the failure comes back as an HTML error page.

2. **`share.link`** — a self-authenticating view of the real invoice, carrying its own
   token so the tab needs no session. The extension opens it in a hidden tab and asks
   Chrome for the same PDF that "Save as PDF" would produce. Refrens already tags its app
   chrome `.no-print` / `.no-pdf` and ships a print stylesheet, so what lands on the page
   is the invoice alone. **This is the default.**

`Page.printToPDF` is only reachable through the debugger API — that's why the manifest
asks for `"debugger"`, and why Chrome shows a debugging banner on the hidden tab for the
few seconds it's attached. The tab is closed and the debugger detached in a `finally`
block either way.

The result is a genuine vector PDF with selectable text, not a screenshot: 1 page,
~155 KB, ~856 extractable characters covering the business name, client country, service
description, totals, bank details and signature.

> One caveat worth knowing: Chrome's PDF text layer preserves the web font's kerning, so
> a strict parser can read the styled headings with stray spaces (`Your Comp a ny Pvt Ltd`).
> The clean string still appears elsewhere in the document (Bank Details → Account Name).
> Refrens' own hosted PDF is Chrome-rendered HTML too, so it would behave the same way.

## When it misbehaves

Nothing can hang silently any more: network calls give up after 20 s, any handler after
60 s, and both name the step that stalled. Triage in this order:

1. **Click the extension icon.** A red dot means no Refrens credentials — that is the
   single most common cause. Add API keys in Settings, or open a Refrens tab.
2. **Reload the Skydo page** after reloading the extension. Chrome re-registers content
   scripts on reload but does not re-inject them into tabs that are already open.
3. **Right-click the icon → Inspect service worker.** Every request logs
   `[rsb] FIND_MATCHES#1 start / ok in 812ms / failed after …`, plus which invoice page
   it was fetching.

## Layout

```
manifest.json
src/
  background.js      service worker — credentials, matching, PDF
  refrens-api.js     auth (API keys → JWT, session fallback), paging
  match.js           scoring + human-readable reasons
  capture.js         share.link → real Refrens PDF via Page.printToPDF
  refrens-token.js   content script on refrens.com — relays the session token
  skydo-panel.js     content script on skydo.com — panel, preview, file injection
  skydo-panel.css
  popup.html/js      connection status
  options.html/js    API keys, business URL key, hosted-PDF toggle
```

## Tests

From the parent folder:

```bash
node test/worker.test.js                        # service-worker message plumbing
node test/match.test.js                         # ranking
node test/capture.test.js "<a Refrens share.link>"   # real PDF capture
```

`match.test.js` runs the real invoice list from this account against the real Skydo
payment: USD 650.00 from "Acme Holdings Inc" ranks Refrens **INV-0165 · Acme Holdings ·
USD 650 · UNPAID** first at 100/100, with an already-paid decoy for the same client at 77
and an INR duplicate filtered out entirely.

`worker.test.js` stubs the extension APIs and the Refrens endpoints and drives real
`FIND_MATCHES` round trips through the service worker: no credentials, session token,
API-key exchange, a dead socket, and a 401. Every one has to *answer* — the bug that
motivated it was a request that never settled, leaving the panel spinning with nothing
to report.

`capture.test.js` drives headless Chrome's `--print-to-pdf` over a share link — the same
renderer and the same print media the extension uses — then reads the result back with
PDFKit to confirm the fields Skydo asks for survived into the text layer.
