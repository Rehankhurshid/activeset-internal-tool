# Refrens → Skydo Invoice Bridge — setup

A Chrome extension that sits on Skydo's **Unmapped payments** page, finds the matching
invoice in Refrens, and puts the **real Refrens invoice PDF** into Skydo's upload box.
No downloading from Refrens and re-uploading by hand.

It is an unpacked extension — not on the Chrome Web Store — so it installs from a folder.

---

## 1. Unzip it somewhere permanent

Chrome re-reads this folder every time it starts. If you delete or move it, the extension
breaks. Your home folder or `~/Developer` is fine — **not** Downloads or Desktop, where
it is easy to clear out by accident.

## 2. Load it into Chrome

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose the `refrens-skydo-bridge` folder
4. Pin it via the puzzle-piece icon so you can see its status

Chrome will warn that the extension can read and change data on `skydo.com` and
`refrens.com`, and that it can **debug your browser**. Both are expected. The debugging
permission is there for one reason: `Page.printToPDF` is the only way an extension can
turn Refrens' rendered invoice into a real PDF, and it is only reachable through the
debugger API. You will see a debugging banner on a hidden tab for a few seconds each
time it fetches an invoice.

## 3. Connect your own Refrens

**Nothing in this package contains anyone's credentials.** They live in Chrome's
extension storage, per profile, so you need to add your own.

Click the extension icon → **Settings**, then either:

- **API keys (recommended).** In Refrens: **Settings → Integrations → Enable Refrens
  Invoices API → Generate API Keys**. Paste the App ID and App Secret, and set
  **Business URL key** to the slug in your Refrens URL — for
  `refrens.com/app/your-business/invoices` that is `your-business`. This works with no
  Refrens tab open.
- **Or nothing at all.** Just open your Refrens dashboard in a tab; the extension borrows
  that session while the tab exists.

The dot in the popup turns green once it is connected.

## 4. Use it

Open any Skydo unmapped payment (`dashboard.skydo.com/unmapped-payment/…`). A panel
appears at the top right and starts matching immediately — no button to press.

- **Suggested** — invoices ranked against the payment, each showing *why* it matched:
  amount, payer name, outstanding balance, dates.
- **Browse** — search all your Refrens invoices by number or client, filter to
  outstanding only, or widen to all currencies.

Pick one → **Get invoice PDF** → check the preview → **Attach to Skydo**.

It stops there deliberately. Mapping a payment moves money against an invoice, so the
final confirm stays in Skydo's own dialog.

---

## Known issue

**"Get invoice PDF" is not working yet.** The matching, browsing and search all work;
the PDF capture step is still being debugged. If you hit it, open the service worker
console (right-click the extension icon → **Inspect service worker**) — every request
logs a line starting `[rsb]`.

## If something else misbehaves

Nothing hangs silently: network calls give up after 20 s, any request after 60 s, and
both name the step that stalled.

1. **Red dot on the icon** → no Refrens credentials. See step 3.
2. **Panel missing** → reload the Skydo page. Chrome does not re-inject content scripts
   into tabs that were already open when the extension loaded.
3. **Anything else** → right-click the icon → **Inspect service worker** → Console.

## Requirements

Chrome (or any Chromium browser with `chrome://extensions`), a Refrens account with
invoices, and a Skydo account. macOS/Windows/Linux all fine.
