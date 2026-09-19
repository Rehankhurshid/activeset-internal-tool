# Audit tabs: from three lists to one fix loop

Status: built 2026-09-20 (steps 1–5 in one pass; see "What shipped" at the end).
The sections below are the proposal as written before building; the deltas are
listed at the bottom.

## What the screen is for, and what it does instead

The Audit screen exists so that someone on the team can look at a client site and
answer three questions: **can this ship**, **what has to be fixed first**, and
**is it fixed yet**. Then they go and fix it in Webflow and come back.

What it does today is show three lists that were built at different times, count
in three different units, and offer no way to act on anything. On privado.ai:

- The header says **"1 issues"** over a site with 348 missing alts and 86 broken
  links, because `issueCount` only counts page-status buckets.
- The banner says **"1 deployment blocker — open a row to review details"** and
  does not say which row, on a table of 365 collapsed rows. The filter that would
  show the row exists two inches away and the banner does not use it.
- The Missing ALT tab shows **306 page rows with identical numbers** (8 missing, 8
  repeated, 8 main) because 306 CMS profile pages share one template with 8
  images. That is **one fix, shown 306 times**. The view that would show it as one
  fix ("Unique images") is the one with no action button.
- **"Broken Links 86"** is per-`<a>`, so one dead footer link on 40 pages is 40 of
  the 86, and anything link-checked before today still counts LinkedIn's 999
  bot-block as dead.
- Every "Repeated Pages" / "Main" / "Count" column is either mislabelled, a column
  of 1s, or noise on any site without a `<main>` element.
- The toast **"Missing or insufficient permissions"** is a real bug, not a UI
  problem: `/api/scan-images` and `/api/image-scan/start` call the *browser*
  Firebase SDK from a server route, where there is no signed-in user, and the
  rules (correctly) refuse. Scan Images has been broken since the rules tightened
  on 2026-09-18.

None of the three tabs knows the others exist. Fixing one image does not change
the page's status; fixing a broken link does not clear anything; nothing can be
marked fixed, ignored, or assigned; nothing is exported. The full inventory of
the current behaviour is at the bottom of this document.

## The redesign in one sentence

**Group by what you fix, not by where it was found; put the action next to the
finding; make the rescan the proof.**

## Shape

### One header for the whole screen

```
Ready to ship?  ●  No — 1 page has placeholder copy       [Show it]
365 pages · 42 scanned today · last scan 2h ago            [Scan all]

  Fixes                          Effort      Clears
  ─────────────────────────────  ──────────  ────────────────────────
  8 template images need alt      1 fix      294 pages · 2,352 flags
  3 static-page images need alt   3 fixes    3 pages
  2 dead links in the footer      1 fix      40 pages · 80 flags
  4 dead links in body copy       4 fixes    4 pages
  12 links we couldn't verify     —          LinkedIn, Cloudflare  [check]
```

The header answers "can this ship" with the one thing that actually blocks
(placeholder copy), named and linked. Under it, the **Fixes** table is the new
spine: every finding on the site, rolled up into the unit someone would fix it
in, sorted by pages cleared per fix. The three counts that disagree today become
one table that adds up.

"Effort" is a count of distinct things to change. "Clears" is the count of pages
and flags that go away when it is done. Both are computed, not judged.

### Three tabs, one job each

The tabs stay because they are three different *kinds of work*, done by different
people at different times. They stop being three different *lists*.

**Pages** — *is this page ready?*
Keeps the table, loses the noise. Each row gets a single readiness state derived
from everything the other two tabs know: `Blocked` (placeholder copy), `Fix
needed` (has an open alt or link finding it does not share with a template),
`Template fix pending` (its only findings are shared and already assigned), `Ready`.
The row sheet gains a "Fixes on this page" list with the same actions as the
other tabs, so someone reviewing one page can clear it without leaving. Bulk scan
completion updates in place instead of `window.location.reload()`.

**Alt text** (renamed from Missing ALT) — *give every image that needs it a
description.*
Default view is **by image**, not by page, because that is the unit Webflow edits
in. Each row is one asset:

```
[thumb]  team-photo-4.webp                          Webflow asset
         no alt · appears on 294 pages · in page body
         Jev: needs alt text (83%)
         alt text  [__________________________]  [Suggest] [Save to Webflow]
                                                  [Decorative — leave empty]
```

Three actions, all in place:
- **Save to Webflow** writes `altText` through the existing
  `PATCH /api/webflow/assets/{id}` route. The asset id is already in the src
  filename prefix on every Webflow URL; for CMS images it goes through the
  existing `cms/update` route instead, and the row says which.
- **Suggest** fills the field via the existing alt generator, gated so it is only
  offered where a generator is configured.
- **Decorative** records the decision so the row leaves the list and the scanner
  stops flagging it. Jev's decorative verdict pre-sorts the list: images it is
  confident are decorative sit in a collapsed "probably decorative — confirm"
  section at the bottom instead of mixed in with the real work.

After Save the row shows "saved · verify" and a single-image recheck (fetch one
page, look for that src, read the alt) confirms it. Verified rows drop off. That
is the loop: find → fix in place → prove.

Sites that are not on Webflow get the same list without the Save button; the
export (below) covers them.

**Links** (renamed from Broken Links) — *decide what to do about each dead URL.*
Default view is **by destination URL**, one row each, with the pages it appears on
and the anchor text. Two sections, never mixed:

- **Broken** — 404/410/5xx/DNS. Sorted by Jev's "would a visitor click this"
  judgment, so "Start a project → /contact" is above "Cookie policy". Actions:
  **Fix** (opens the page in Webflow Designer; the tool cannot edit link targets),
  **Ignore** (with a reason, e.g. "intentional, page coming"), **Recheck**.
- **Couldn't verify** — 999/403/429/401 bot-blocks. Shown, counted separately,
  never counted as broken. One button rechecks them all.

Nav/footer duplicates collapse into one row that says "in the footer on 40
pages" instead of 40 rows.

### What crosses the tabs

- **Status derives from findings.** A page's readiness on the Pages tab is
  computed from open findings on the other two tabs. Fix an image, the 294 pages
  move from `Template fix pending` to `Ready` on the next verification.
- **Decisions persist.** "Decorative", "Ignore", and "Fixed, unverified" are stored
  per finding, keyed by fingerprint, so a rescan does not resurrect a decision
  someone already made. Today the only ignore list is hardcoded substrings in the
  component.
- **One export.** "Copy fix list" produces a Markdown table of open fixes grouped
  the same way as the Fixes table — for the client who edits their own site, or
  for a Slack message to whoever is doing the work. Today there is no export at
  all.
- **One rescan vocabulary.** Every row, on every tab, has one recheck button that
  checks exactly that thing. "Scan all" stays for the nightly-style full pass.

### Mobile

Rehan reads this on a phone. The Fixes table is the whole screen at phone width;
tabs are below it; each row is a card with the action buttons full-width. No
horizontal tables.

## What Jev does here, and what it does not

Jev already judges every image (decorative? / alt useful?), every broken link
(would anyone click it?), and every page's copy (placeholder present?). Today
those judgments are only visible in the single-page detail screen. The redesign
uses them for **ordering and pre-sorting only**: decorative-likely images go to
the bottom, high-intent dead links go to the top, and the uncertain band stays
labelled uncertain. Nothing is auto-dismissed on a probability; a person still
clicks Decorative or Ignore. Counting, grouping, and "does this clear the page"
stay in code.

## Data model additions

Small, and all additive.

```
projects/{id}/audit_decisions/{fingerprint}
  kind: 'alt' | 'link'
  decision: 'decorative' | 'ignored' | 'fixed_unverified' | 'verified'
  reason?: string
  by: uid, at: timestamp
  altText?: string            // what was written, for the verify step
```

Fingerprint for images is the existing `hostname + pathname`; for links it is the
normalised absolute URL. `link_audits` is unchanged. Readiness is computed in a
pure domain function, `readinessOf(page, findings, decisions)`, with tests.

## Bugs that get fixed on the way, regardless of the UI

These are wrong today and the redesign cannot stand on them:

1. **Permissions toast.** `/api/scan-images`, `/api/image-scan/start`, and
   `src/workflows/image-scan.ts` move from `projectsService` (browser SDK) to the
   admin loader that `/api/scan-bulk` already uses.
2. **Check All Scanned erases `unverifiableLinks`** on every page it touches. It
   passes the field through, and the whole loop moves server-side with cancel and
   completion, like bulk scan.
3. **Every small write rewrites every audit doc.** `saveBrokenLinkResults` and
   `saveImageAltResults` pass `changedLinkIds` (added this morning for exactly
   this).
4. **Image scan bumps `lastRun`**, so "Last scan" lies. It stops.
5. **Scan All Images only revisits pages that already have findings**, so it can
   never find a new one. It scans all pages.
6. **Unscanned pages score 0** and drag the average down. They are excluded.
7. **Folder-type edits live in localStorage.** They persist via the existing
   `updateProjectFolderPageTypes`, which is currently dead code.
8. **Sorting by "recently scanned" parses a localised date string.** It uses the
   ISO timestamp that is already on the object.

## Build order

Each step ships on its own and leaves the screen better than it found it.

1. **Foundation** (½ day): the eight bugs above; `unverifiableLinks` shown on
   the dashboard; `readinessOf` + findings roll-up as pure domain code with tests.
   No visible redesign yet, but the numbers start agreeing and Scan Images works.
2. **Header + Fixes table** (1 day): the one header, the named blocker with
   click-through, the Fixes roll-up. Existing tabs unchanged beneath it.
3. **Alt text tab** (1½ days): by-image default, Save to Webflow / Suggest /
   Decorative, `audit_decisions`, single-image verify, copy fix list.
4. **Links tab** (1 day): by-URL default, Broken vs Couldn't verify, Ignore with
   reason, server-side recheck with cancel.
5. **Pages tab** (1 day): derived readiness, "Fixes on this page" in the sheet,
   in-place refresh instead of reload, virtualised rows so expanding groups stops
   crashing the tab.
6. **Split the file.** `WebsiteAuditDashboardScreen.tsx` is 3,622 lines in one
   component. Steps 2–5 each land as their own component under
   `site-monitoring/ui/components/audit/`; by the end the screen file is a
   layout.

About 5 days. Step 1 alone is worth doing today.

## Decisions for Rehan

Defaults chosen; say so if any is wrong.

1. **Save to Webflow from the audit screen.** Default yes. It uses the token the
   project already stores and the PATCH route that already exists. The
   alternative is copy-the-fix-list-and-do-it-in-Designer, which the export covers
   anyway.
2. **Which alt generator.** The existing one is Ollama, which only works with a
   local instance and is off in production. Default: Suggest is hidden until a
   generator is configured; wiring Gemini (already a dependency) is a half-day
   follow-up, not part of this.
3. **Decorative is a human click, never automatic.** Default yes, even at 95%.
   Jev pre-sorts; a person decides.
4. **Client share view.** The same screen renders read-only behind the audit share
   token. Default: the client sees the Fixes table and the export, not the action
   buttons.

## Appendix: full inventory of what is wrong today

Twenty findings from reading the component and its routes, kept here so nothing
is lost when the file is split.

1. Three pills count three units: Pages = filtered rows, ALT = unique
   fingerprints unfiltered, Broken Links = per-`<a>` occurrences unfiltered.
2. Header `issueCount` excludes alt and link findings entirely.
3. `avgScore` includes never-scanned pages as 0.
4. Blocker banner is static text; no page name, no link, no filter; disappears
   while a bulk scan runs because `displayStatus` is overridden.
5. Per-page view repeats each template asset once per page; the by-image view
   has no action button.
6. "Repeated Pages" means "pages containing a shared asset", not duplicate pages.
7. "Main" falls back to `<body>` when there is no `<main>`/`<article>`; on such
   sites every image is "Main" and the red badge is noise.
8. "Count"/"Occurrences" is always 1: scanner de-duplicates by normalised src
   before storing, UI keys rows on raw src.
9. A page group can say "Missing 2" for what the pill counts as 1 (query-string
   variants).
10. Check All Scanned is a browser-side sequential loop with no cancel, no
    completion toast, silent per-page failure, and it wipes `unverifiableLinks`.
11. `unverifiableLinks` is not rendered on the dashboard at all; pre-2026-09-20
    link checks still count LinkedIn 999 as broken.
12. `saveBrokenLinkResults` and `saveImageAltResults` rewrite every audit doc and
    read the whole subcollection twice for a one-page change.
13. Image scan bumps `lastRun`.
14. Scan All Images only scans pages with recorded findings.
15. `window.location.reload()` on bulk completion, cancel, and folder-type save.
16. Folder-type save writes localStorage only; `updateProjectFolderPageTypes` is
    dead code, so teammates see different classifications.
17. Image-scan progress emits a toast per heartbeat (up to ~73 on a 365-page run).
18. Bulk-scan start/poll failures and the 50-distinct-URLs-per-page link cap are
    never surfaced.
19. Groups default collapsed because expanding all crashed Chrome; rows are
    unvirtualised and thumbnails are raw `<img>` against origin URLs.
20. "Recently scanned" sort parses `toLocaleString()` output; `"-"` becomes `NaN`.

Plus the permissions bug: `/api/scan-images`, `/api/image-scan/start`, and
`src/workflows/image-scan.ts` call `projectsService` (browser SDK) from the
server, which has no `request.auth` and is denied by the `projects` rules since
the 2026-09-18 tightening. The error string is relayed verbatim to the toast.

## What shipped, and where it differs from the above

Everything in steps 1–5 landed, with these deliberate differences:

- **No "Suggest" button.** The only alt generator wired is Ollama, which needs a
  local instance and is off in production. Wiring Gemini is a separate half-day.
- **"Check all pages" is a browser-side loop**, three pages at a time, stoppable,
  with a completion toast — not a durable server workflow. It passes
  `unverifiableLinks` through instead of erasing them.
- **No row virtualisation** on the Pages table; groups still default collapsed.
- **Publish before verify.** Alt written through the Webflow API is not live
  until the site is published, so Save records `fixed_unverified`, the tab
  offers Publish site, and Verify rescans one page. A newer scan that still
  sees no alt marks the row regressed with a "was the site published?" hint.
- **Verify = rescan one page**, not a per-image endpoint. `/api/scan-images`
  now also returns the images it saw so the screen can check the one it cares
  about.
- **Fixes table lives above the tabs** rather than inside a tab, so it is the
  first thing on a phone.
- **Folder types now persist** to the project document (the dead
  `updateProjectFolderPageTypes` is live).
- **Bulk scan completion** shows a toast and lets the subscription update the
  table; no reload on complete, cancel, or folder save.

Step 6 (splitting the file) happened as a side effect: the screen went from
3,622 to about 2,650 lines, and everything new is in
`src/modules/site-monitoring/ui/components/audit/` and the domain module.

One-time step after deploying: `npm run security:deploy-firestore-rules` so the
`audit_decisions` subcollection is writable by the team. Until then Decorative,
Ignore, Fixed and Verify fail with a toast; nothing else is affected.
