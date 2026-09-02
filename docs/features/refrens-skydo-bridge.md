# Refrens → Skydo Invoice Bridge

**Location:** [`extensions/refrens-skydo-bridge/`](../../extensions/refrens-skydo-bridge/)
**Type:** Chrome extension (MV3), standalone — not part of the Next.js app
**Status:** working, with one known bug (see below)

Reconciling a Skydo unmapped payment normally means finding the invoice in Refrens,
downloading its PDF, and re-uploading it to Skydo by hand. This extension collapses that
into one panel on the Skydo page: it finds the matching invoice, shows why it matched,
and puts **the real Refrens invoice PDF** into Skydo's upload box.

Skydo ships a native Zoho Books sync but nothing for Refrens, which is the gap this fills.

## Install

Unpacked, from `chrome://extensions` → Developer mode → Load unpacked. Full steps,
written for someone outside this repo, are in
[`extensions/refrens-skydo-bridge/INSTALL.md`](../../extensions/refrens-skydo-bridge/INSTALL.md).

Credentials are never committed. Each user adds their own Refrens API keys
(Refrens → Settings → Integrations → Generate API Keys) in the extension's Settings,
or just leaves a Refrens tab open and the extension borrows that session.

## How it works

| Step | Mechanism |
|---|---|
| Read the payment | `GET /api/funding-invoice-mapping?fundingId=…` on Skydo, same-origin with the user's cookies. Falls back to scraping the labelled blocks on the page. |
| Authenticate | `POST api.refrens.com/authentication` with `{strategy:'app-secret', appId, appSecret}` → JWT, cached until expiry. Session-token fallback via a content script on `refrens.com/app/*`. |
| Find candidates | Four parallel Feathers queries (amount ±3%, outstanding balance ±3%, everything unpaid, payer-name regex). ~350 ms, ~14 KB. |
| Rank | Currency is a hard filter; then amount, payer-vs-client name, outstanding balance, date proximity. Each rule renders its own reasoning. |
| Fetch the PDF | Opens the invoice's Refrens `share.link` in a hidden tab and captures it with `Page.printToPDF`. |
| Attach | Sets the file on Skydo's hidden `<input type=file>` via `DataTransfer`. |

It stops at *file attached*. Mapping a payment moves money against an invoice, so the
final confirm stays in Skydo's own dialog.

### Why it captures rather than downloads

The Refrens API has **no PDF endpoint** — create, find, get and cancel are the whole
documented surface. The undocumented `share.pdf` link points at an internal print host of
theirs that currently 404s after ~30 s; Refrens' own Download button is broken for the
same reason. So the extension captures their rendered `share.link` view instead, which is
the genuine document — their template, logo, bank block, signature — as real vector text.

`Page.printToPDF` is only reachable through the debugger API, which is why the manifest
requests `"debugger"` and Chrome shows a debugging banner on the hidden tab.

## Known issue

**"Get invoice PDF" does not work yet.** Matching, browsing and search are fine; the
capture step is still being debugged. Every request logs to the service worker console
(right-click the extension icon → Inspect service worker) with a `[rsb]` prefix.

## Tests

Plain Node, no framework, no install:

```bash
cd extensions/refrens-skydo-bridge
node test/worker.test.js   # service-worker message plumbing, 30 checks
node test/match.test.js    # ranking, including wrong-currency and settled decoys
node test/capture.test.js "<a Refrens share.link>"   # real PDF capture via headless Chrome
```

`worker.test.js` stubs the extension APIs and Refrens endpoints and drives real
`FIND_MATCHES` round trips: no credentials, session token, API-key exchange, dead socket,
401. Every path must *answer* — the bug that motivated it was a request that never
settled, leaving the panel spinning with nothing to report.

## Packaging

```bash
npm run extension:pack:refrens-skydo
```

Writes a versioned zip to `dist/` for distribution. Unpacked extensions have no
auto-update, so the filename carries the manifest version.

## Notes for whoever picks this up

- Both vendor integrations rely on undocumented behaviour and can break without notice:
  Refrens' `share.link`, and Skydo's `funding-invoice-mapping` endpoint plus the shape of
  its upload modal.
- Refrens' `$regex` is case-sensitive unless `$options=i` is sent. `$search` is rejected.
- `$select` trims a ~25 KB invoice document to ~1 KB; without it, listing invoices moves
  megabytes.
- MV3 service workers are torn down after ~30 s idle and plain `fetch` does not reset
  that timer — hence the `chrome.runtime` keepalive ping in `background.js`.
