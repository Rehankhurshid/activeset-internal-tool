# Project sheet contract

> Status: phases 1–3 built (2026-10-01). Phases 4 and 5 not started.
> Strategy page with the interactive sheet explorer and portal preview:
> https://claude.ai/artifact/DH5gt8xGfV1ipKkapAzsRL

## What Rehan asked for

Bind the client portal to each project's Google Sheet "very clearly and
interactively", with a sheet structure for the different kinds of project:
"all the major things will remain same but there might be few extra tabs that
might come in which we can ignore."

## What the sheets in Drive showed

Eight real trackers, 2024 to 2026: the 2024 Webflow Development template,
Cosmos, Muffins AI, the Canopy migration, RevPack, Different AI, Peak XV's SEO +
AEO tracker, House of Haseena.

- Every website sheet since 2024 has a page tracker, SEO tags, redirects and a
  global checklist.
- Only Different AI (31 Aug 2026) added Overview, Timeline, Client Inputs and
  Change Log. Those four are what a client portal needs, built by hand.
- Four sheets still carry LimeChat's URLs in a `Sheet20` or `REDIRECTS` tab,
  copied in from an old project. Reading every tab would put another client's
  data on a portal, so unknown tabs are ignored by default.
- Column names drift ("Staging Link", "Page Link [Paste Staging URL]",
  "Test Link"), headers sit under merged title rows, and the older global
  checklist has no header at all.

## Decisions (Rehan, 2026-10-01)

1. **The team writes the sheet; the app reads it.** This reverses "nobody edits
   the sheet" from `website-delivery-system.md` for every tab except the app's
   own generated `Project Tracker` tab, which the reader simply reads like any
   tracker.
2. **The client gets the portal, plus edit access to `[Fill this]` tabs only.**
   The team links the client to the sheet with a switch; other ranges are
   protected in Sheets.
3. **Templates are master sheets in Drive that the app copies**, not sheets
   generated from code, so the team can restyle them without a deploy.
4. **Build phases 1–3 first.**

## The contract

Five core kinds, present in every project and driving the portal:

| Kind | Accepted tab names | Feeds |
| --- | --- | --- |
| Overview | Overview, Start here, Project overview, Summary | Header facts (engagement, kickoff, target launch), KEY LINKS → files, PHASES → phase names |
| Timeline | Timeline, Schedule, Roadmap, Phases, Project plan | Stages and milestones; Owner "Client" marks the client's own step |
| Tracker | Any "… Tracker", Pages, Tasks, Deliverables, Requests, Blog/Content Migration | "The work": one workstream per tab, status columns become tracks |
| Client inputs | Client Inputs, Inputs, Dependencies, Decisions, What we need | "What we need from you"; decisions read the same way |
| Change log | Change Log, Change requests, Changes | "Changes outside the agreed scope" |

Modules, read when present: Launch Checklist (also the headerless Project
Global Checklist), SEO Tags (a "– English" suffix sets the language), Redirects.
Any tab ending in `[Fill this]` becomes a client ask. Everything else is
ignored, listed under "Not read" in the Client tab, and can be mapped by hand
("Use as Tracker"), saved per project.

One status legend for every tab: Not started, In progress, Ready for review,
Changes requested, Done, Blocked, Not needed. Unknown words read as In progress
and are listed in the Client tab. "Ready for review" is reserved for reviews
that wait on the client: QA and the team's own development review read as In
progress, and a negation ("Not received", "Not done") is never progress.

Link columns are an exact-name allow-list (Staging link, Design link, Docs,
URL…); columns named internal, invoice, admin, contract, private, password,
login, CMS or billing are never read.

Never read: notes, assignees, contract value, payment terms, budget tabs. The
allow-list test proves none of them reach the portal JSON.

The code: `src/modules/client-portal/domain/project-sheet.*.ts` (contract,
values, read, portal), `src/lib/project-sheet.ts` (bind, sync),
`src/lib/google-api.ts` (`getSpreadsheetMeta`, `readTabsWithLinks`). See
`docs/modules/client-portal.md` → "Project sheet".

## Use cases (for phase 5's master templates)

All share the five core tabs. Modules differ:

| Use case | Tracker | Modules | Seen in |
| --- | --- | --- | --- |
| Website build (design + Webflow) | Page Tracker: Copy, Design, Dev Desktop, Dev Mobile | SEO Tags [Fill this], Launch Checklist, Redirects if replacing a site, Lottie Tracker | Different AI, Muffins AI |
| Webflow from client designs | Page Tracker: Dev Desktop, Dev Mobile, Design link | SEO Tags [Fill this], Analytics Codes [Fill this], Launch Checklist | Cosmos, RevPack, 2024 template |
| Website migration | Page Tracker with old URL | Redirects, Content Migration tracker, SEO Tags, Launch Checklist | Canopy, LimeChat |
| Brand & identity | Deliverables: Concept, Refine, Final files | Asset Handover tracker | Brand Evolution SOP |
| SEO / AEO programme | Tasks | Decisions, team-only Findings | Peak XV & Surge |
| Retainer & support | Requests (month, hours) | months as Timeline phases | retainer agreement |
| Launch / go-to-market | Launch tracker (packages) | Decisions, Content plan; Budget stays team-only | House of Haseena |

## Phases

1. **Contract and reader.** Done. Pure parsers with fixtures transcribed from
   the real sheets (`project-sheet.read.test.ts`).
2. **Bind, snapshot, team card.** Done. "Project sheet" card on the Client tab,
   `/api/client-portal/[projectId]/sheet`, `project_sheets/{projectId}`, a
   15-minute cron.
3. **Portal reads the snapshot.** Done. Your turn, The work (with filters),
   Launch readiness, Changes, header facts, owner badges on milestones.
4. **Interactive stage rail.** Not started: stage drill-down showing each
   stage's work, inputs, meetings and files together.
5. **Use-case templates.** Not started: seven clean master sheets with status
   dropdowns and protected ranges, a stored use case on the project, and
   "Create project sheet" in the New project dialog and the Client tab.

## Before it works in production

- Enable the Google Sheets API and Google Drive API on the Firebase GCP project
  (outstanding since September).
- Share each sheet with the service account as Viewer. The Client tab shows the
  address; a sheet the app created would not need this.
- The portal's Delivery page grid (`projects/{id}/pages`) is not yet a source
  for "The work" when no sheet is bound.
