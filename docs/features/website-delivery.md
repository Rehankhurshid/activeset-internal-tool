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

## Checklists belong to the project, not to this module

Kickoff and the site-wide launch list are **sections of the project's own
checklist**, seeded from an editable SOP template and deep-copied per project.
They are not held in code here.

This was got wrong first time round: those lists were TypeScript constants in
`webflow.stack.ts`, so every project got an identical list and nobody could add,
remove or reword an item without a deploy. No two projects run exactly the same
way, and the app already had a checklist system that solved this properly.

A checklist section carries an optional `stage` (`kickoff` or `launch`). The
Delivery tab renders the sections tagged for the stage you are on; the Checklist
tab shows every section as it always did; both tick the same item through
`checklistService`. Untagged sections — which is every existing template until
someone tags one — appear only on the Checklist tab, so nothing changed for
them.

### Tagging a section

Two places, both per-section:

- **This project only** — Checklist tab, press *Edit Structure*, then pick
  Kickoff, Launch or *Not in Delivery* on the section header. Tagged sections
  carry a small badge when you leave edit mode.
- **Every future project** — Checklist Creator, the stage dropdown beside the
  section title. Checklists are deep-copied at creation, so this changes new
  checklists and leaves existing ones alone.

The tag survives the Creator's Markdown tab as a `> Stage: kickoff` line under
the section heading, and an item's scan signal as a `  - 🔍 Check: page_title`
sub-bullet. Both are covered by `src/lib/template-export.test.ts`, because the
editor round-trips through that format on every tab switch: a field the writer
omits is not just missing from an export, it is deleted on the next save.

An empty stage says so and links to the Checklist tab rather than showing 0 of 0,
which would read as finished.

### The one exception: per-page QC

Per-page QC stays in this module because the checklist model has no page axis and
cannot ask one question of 26 pages. It is still per-project and editable: the
Launch screen's *Edit checks* button rewrites the whole list onto the project,
seeded from the stack until then. Renaming keeps existing answers, since they key
off the check id; removing a check that pages have answered warns with the count
and says the answers stop counting; adding one back later gives it a new id, so
old answers do not return.

A check can name a scan signal, which answers it from the last page audit until a
person says otherwise. Only the signals `resolveAutoCheck` implements are
offered, and `pageChecksFor` drops any other value it finds on the document —
a signal nothing computes would leave a check looking automatic and never
answered.

## Stacks

A stack definition holds only what is structural: the disciplines that become
the page grid's columns and the tracker sheet's columns, plus a starting set of
per-page QC questions. Nothing outside
`src/modules/delivery/domain/stacks/` names a technology.

| Stack | State |
| --- | --- |
| `webflow` | Defined: four disciplines, twelve seeded page checks. |
| `astro-sanity` | Registered, undefined. |
| `next-storyblok` | Registered, undefined. |

Adding one means writing `<stack>.stack.ts` and listing it in `stacks/index.ts`.
Projects with no stack fall back to Webflow.

## The four stages

**Kickoff** — the sections of the project's checklist tagged `kickoff`. In the
shipped Webflow template that is "Input" (what the client owes us) and "Step 1:
Project Planning & Kickoff" (what we do: book and hold the first call once the
deal closes, open the Slack channel, send the welcome email, name the leads,
create the ClickUp list and MarkUp folder, share the tracker, hold the internal
kickoff). Beside it sit the two things that are not checklist items: the sync
cadence and the welcome email draft.

A project whose checklist has no section tagged `kickoff` is shown as not set up
rather than as finished — zero of zero would read as done.

**Build** — the page grid. One row per page, a status per discipline
(`not_started`, `in_progress`, `blocked`, `in_review`, `completed`,
`not_required`), assignee, expected date, design/staging/docs links and a review
comment. Pages are imported from discovered links rather than typed.

**Launch** — the sections tagged `launch`, plus the per-page QC. Readiness is
derived: every applicable page built, and every launch checklist item settled.
An item marked `skipped` counts as not applicable rather than done, which is the
checklist's own way of saying a step does not apply to this project.

**Handover** — walkthrough videos and the launch record.

## Automatic checks

Eight checks answer themselves from the page's existing audit, so the team ticks
judgement calls rather than things a crawler already knows: page title, meta
description, H1, image alt text, Open Graph, link resolution, schema, spelling.

An item on a checklist can also name one of these in `autoCheck`, so a launch
checklist item answers itself.

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
| `projects/{id}.delivery` | Stack, this project's page-check list, call cadence, tracker sheet id. |
| `project_checklists` | Kickoff and launch live here, as tagged sections. Not a delivery collection — the Checklist tab owns it. |

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

1. `npm test` — the derivations, the sheet round trip, the kickoff email, the
   stage readings, and the template Markdown round trip. `npm run test:delivery`
   alone covers this module.
2. `npm run arch:check`.
3. In the app: open a project, add pages from the sitemap, move a status, then
   generate the sheet and confirm the columns match what the client is used to.
4. Import: point it at a copy of the Muffins tracker and confirm the page list
   and statuses come through, and that a second import changes nothing.
5. Stages: on a project with an untagged checklist, confirm Kickoff says it is not
   set up. Tag a section Kickoff from the Checklist tab, confirm it appears under
   Kickoff, tick an item there and confirm the Checklist tab shows it ticked too.
6. Page checks: rename a check and confirm existing answers survive; remove an
   answered one and confirm the warning names the number of pages affected.
