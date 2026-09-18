# Website Delivery

Runs a website project from kickoff to handover, with the page as the unit of
work. Replaces the per-client Google Sheet that used to hold the page list, the
per-discipline status, the launch checklist and the QC matrix.

## Why the page

Every tracker this agency has built — Muffins, Keatech — is the same system by
hand: a row per page, a status per discipline, a staging link, an assignee, a
date. The app already discovers that page list from sitemap scans and the
Webflow page sync, and used to do nothing with it, so the same pages were
maintained twice. Making the page the model removes the duplicate.

The PeakXV SEO/AEO tracker and the metrics tracker are deliberately **not** in
scope. Those are retainer reporting, a different job.

## Stacks

Everything technology-specific lives in a stack definition under
`src/modules/delivery/domain/stacks/`: the disciplines, the launch checks, the
kickoff inputs. Nothing outside that folder names a technology.

| Stack | State |
| --- | --- |
| `webflow` | Defined. Seeded from the migration SOP and the Muffins/Keatech sheets. |
| `astro-sanity` | Registered, undefined. |
| `next-storyblok` | Registered, undefined. |

Adding one means writing `<stack>.stack.ts` and listing it in `stacks/index.ts`.
Projects with no stack fall back to Webflow.

## The four stages

**Kickoff** — two checklists, because kickoff has two sides.

*What the client owes us*: the crawl, assets, Webflow account, domain access,
analytics codes, fonts. The build is blocked on these, so "ready to start
building" means every non-optional one is in.

*What we do*: book the kickoff call once the deal closes, hold it, open the
Slack channel with the client, send the welcome email, name the leads, create
the ClickUp list and MarkUp folder, pull the page list, share the tracker, hold
the internal kickoff. These are tracked here rather than only in the SOP
checklist — that covers the whole build, and its kickoff section is easy to lose
inside sixty-odd items.

Three of our steps answer themselves from project state (the cadence is set, the
tracker exists, pages are on the tracker) and show as "done in the app" with no
checkbox, so nobody ticks a box about something the screen already shows. Steps
that can be performed here link to the control that performs them: the welcome
email opens the draft, the cadence scrolls to its card, the page list jumps to
the Pages stage.

Kickoff is *complete* when both sides are. It is *ready to build* when only the
client's side is — we do not hold a build hostage to our own internal kickoff.

**Build** — the page grid. One row per page, a status per discipline
(`not_started`, `in_progress`, `blocked`, `in_review`, `completed`,
`not_required`), assignee, expected date, design/staging/docs links and a review
comment. Pages are imported from discovered links rather than typed.

**Launch** — the site-wide checklist plus a short QC list per page. Readiness is
derived: every applicable page built, every pre-launch check answered and
passing. Post-launch checks are tracked but never gate a launch.

**Handover** — walkthrough videos and the launch record.

## Automatic checks

Eight checks answer themselves from the page's existing audit, so the team ticks
judgement calls rather than things a crawler already knows: page title, meta
description, H1, image alt text, Open Graph, link resolution, schema, spelling.

Three rules matter:

- `unknown` is not `fail`. An unscanned page has not failed anything, and
  reporting it as a failure trains people to ignore the column.
- A person's answer always beats the scan, and is shown as an override.
- `not_required` drops an item out of the denominator rather than counting as
  done.

## Data

| Where | What |
| --- | --- |
| `projects/{id}/pages/{pageId}` | One document per page. Team-only in rules. |
| `projects/{id}.delivery` | Stack, site-check answers, kickoff answers, call cadence, tracker sheet id. |

Pages are a subcollection, not an array on the project: a large site is hundreds
of rows each carrying its own statuses and QC answers, and rewriting an array to
tick one checkbox both loses concurrent edits and heads for the 1MB ceiling.
Status writes use dotted field paths so two people working two columns of the
same row do not overwrite each other.

## The tracker sheet

The app owns the page data; the sheet is generated from it. Nobody edits the
generated sheet — an edit there is overwritten on the next sync. That is the
only arrangement that survives an automatically discovered page list, since a
hand-maintained list drifts from the real site within a sprint.

The generated tab is called `Project Tracker` and matches the column order the
clients already see, so nothing looks new to them:

```
No. | Page | Docs | Staging Link | Status – <discipline>… | Assignee | Expected Date | Review Comment
```

Group headings ("Features [P1]") are written into the Page column with the rest
of the row empty, exactly as in the hand-made sheets.

**Importing** exists for projects that started in a spreadsheet. It matches
columns by header text rather than position, so both the Muffins shape
(Copy/Design/Dev) and the Keatech shape (Content/Desktop/Mobile) read correctly.
Existing pages keep what they have; the sheet only fills in blanks. Status words
are read leniently — `Completed`, `DONE`, `✅` all land on completed, and an
unrecognised note like `Assets Pending / Layout Ready` becomes `in_progress`
rather than being discarded.

### Setup, one time

Sheets uses the Firebase service account this app already runs as, so there is
no second credential to manage. Two APIs must be enabled on the same Google
Cloud project as Firebase:

1. **Google Sheets API**
2. **Google Drive API**

Until they are, every sheet action fails with a message saying exactly that.
Generated sheets are owned by the service account and shared out, so nobody's
personal Drive holds the client's tracker. Sharing deliberately does **not**
send Google's notification email — the team introduces the tracker in the
kickoff note, in their own words.

No new npm dependency was added: the JWT bearer flow is a signed assertion and a
token exchange, both of which `node:crypto` and `fetch` handle. `googleapis` is
a very large package to carry into a serverless bundle for two endpoints.

## Files

- Domain: `src/modules/delivery/domain/` — types, stack definitions, progress and
  readiness derivations, sheet row building and parsing, kickoff email. All pure
  and tested (`npm run test:delivery`).
- Storage: `src/modules/delivery/infrastructure/delivery.repository.ts`.
- Server: `src/lib/google-api.ts` (auth and a minimal Sheets/Drive client),
  `src/lib/delivery-sheet-sync.ts` (sync, share, import),
  `src/app/api/delivery/[projectId]/sheet/route.ts`.
- UI: `src/modules/delivery/ui/` — the page grid, launch checklists, kickoff
  panel, tracker sheet card.

## Verification

1. `npm run test:delivery` — the derivations, the sheet round trip, the kickoff
   email.
2. `npm run arch:check`.
3. In the app: open a project, add pages from the sitemap, move a status, then
   generate the sheet and confirm the columns match what the client is used to.
4. Import: point it at a copy of the Muffins tracker and confirm the page list
   and statuses come through, and that a second import changes nothing.
