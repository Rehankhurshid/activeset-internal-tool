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

## The arc: every stage comes from the project's own SOP

Delivery renders the project's whole run, start to end. **Every section of the
project's checklist is a stage**, in the order the SOP puts them: a Webflow build
shows eleven, a brand project shows nine, and a future Astro or Storyblok SOP
shows whatever it has, with no code written for it.

This was got wrong twice. First the lists were TypeScript constants, so every
project got an identical one and rewording an item needed a deploy. Then they
were checklist sections but only two tags existed, `kickoff` and `launch`, so
Delivery rendered four of the Webflow SOP's eleven sections and steps 2 through 6
— design prep, Webflow setup, CMS, page development, integrations — appeared
nowhere. Most of what the team actually does had no home.

### Roles

A section may also carry a **role**, which is the only thing about a stage this
code hardcodes, because it is the only place the app does more than show a list:

| Role | What Delivery adds at that stage |
| --- | --- |
| `kickoff` | The sync cadence and the welcome email draft |
| `pages` | The page grid — this is where the build happens |
| `client_review` | Ends with the client approving |
| `launch` | Readiness, derived from pages, per-page QC and this stage's items |

Most sections have no role and are ordinary steps. Several may share one; the
first plays host to that role's extras. A project whose SOP claims no `pages`
stage still gets the grid, spliced in after the last kickoff stage, because a
website gets built whether or not the SOP says where.

Roles are set per section in two places: the Checklist tab under *Edit
Structure* for one project, and the Checklist Creator for every future one. The
tag that came before roles, `stage: 'kickoff' | 'launch'`, is still read and
means the role of the same name, so no live project needs re-tagging.

### Gates

A stage's items can be marked **blocking**. A later stage whose earlier blocking
items are unsettled says what it is waiting on — and opens anyway. Nothing is
disabled and no control is hidden, because a team that has to work out of order
at 6pm on a Friday should not have to fight the tool. The gate is opt-in one item
at a time, so a project that marks nothing blocking behaves exactly as before.

## A task carries its context

A checklist item used to be one line of title text. The helper every built-in
template used accepted only a title, an emoji and a scan signal, so authors put
URLs inside titles, where they rendered as unclickable plain text. An item now
carries:

- `howTo` — what to actually do, shown inline under the title. Never behind a
  hover: guidance nobody can see is guidance nobody follows.
- `links` — labelled tools and references. The older single `referenceLink` is
  still read and shown as "Reference".
- `blocking` and `dueDate` — what makes a stage gate, and what makes something
  capable of being overdue.

These survive the template Markdown round trip, which the Creator performs on
every tab switch. `src/lib/template-export.test.ts` asserts that the writer and
its own parser agree, because a field the format drops is not merely missing from
an export — it is deleted from the template on the next save.

To change what one project does, edit that project's checklist. To change what
future projects do, edit the template.

### The one thing that is not a checklist

Per-page QC stays in this module, because a checklist has no page axis and cannot
ask one question of 26 pages. It is per-project and editable too: *Edit checks*
on the launch stage writes the list onto the project, seeded from the stack until
then. Renaming keeps existing answers, since they key off the check id; removing
an answered check warns with the number of pages affected.

## Stacks

A stack definition holds only what is structural: the disciplines that become the
page grid's columns and the tracker sheet's columns, plus a starting set of
per-page QC questions. Nothing outside `src/modules/delivery/domain/stacks/`
names a technology, and the arc itself is stack-agnostic — it comes from the SOP.

| Stack | State |
| --- | --- |
| `webflow` | Defined: four disciplines, twelve seeded page checks. |
| `astro-sanity` | Registered, undefined. |
| `next-storyblok` | Registered, undefined. |

Adding one means writing `<stack>.stack.ts` and listing it in `stacks/index.ts`.
Projects with no stack fall back to Webflow.

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
| `project_checklists` | Every stage of the arc lives here, as sections. Not a delivery collection — the Checklist tab owns it. |

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

- Domain: `src/modules/delivery/domain/` — `delivery.arc.ts` is the spine (stages,
  roles, progress, gates); alongside it are types, stack definitions, readiness
  derivations, sheet row building and parsing, and the kickoff email. All pure and
  tested (`npm run test:delivery`).
- Storage: `src/modules/delivery/infrastructure/delivery.repository.ts`.
- Server: `src/lib/google-api.ts` (auth and a minimal Sheets/Drive client),
  `src/lib/delivery-sheet-sync.ts` (sync, share, import),
  `src/app/api/delivery/[projectId]/sheet/route.ts`.
- UI: `src/modules/delivery/ui/` — `DeliveryTab` picks a stage off `StageRail` and
  hands it to `StageScreen`, which renders the items through `StageChecklist` and
  composes the role extras (`KickoffExtras`, `LaunchExtras`, the page grid).
- Authoring: `src/components/checklist/ChecklistSection.tsx` (role per project),
  `src/components/checklist-creator/ChecklistEditor.tsx` (role and item context
  per template), `src/lib/template-export.ts` (the Markdown round trip).

## Verification

1. `npm test` — the derivations, the sheet round trip, the kickoff email, the
   stage readings, and the template Markdown round trip. `npm run test:delivery`
   alone covers this module.
2. `npm run arch:check`.
3. In the app: open a project, add pages from the sitemap, move a status, then
   generate the sheet and confirm the columns match what the client is used to.
4. Import: point it at a copy of the Muffins tracker and confirm the page list
   and statuses come through, and that a second import changes nothing.
5. The arc: open a project whose checklist came from the Webflow SOP and confirm
   the rail shows every section, not just the tagged ones. Tick an item on a stage
   and confirm the Checklist tab shows it ticked too.
6. Roles: set a section to the build stage on the Checklist tab and confirm the
   page grid moves into it and the separate Pages entry disappears.
7. Gates: mark an item blocking, then open a later stage and confirm it names what
   it is waiting on and still lets you work.
8. Page checks: rename a check and confirm existing answers survive; remove an
   answered one and confirm the warning names the number of pages affected.
9. Round trip: open a template in the Creator, switch to Markdown and back, and
   confirm the how-to text, links and notes are all still there.
