# Website delivery: kickoff to handover

## Context

Today a website project runs out of a Google Sheet per client. The Muffins and
Keatech trackers are the same system built twice by hand: a row per page, a
status per discipline, a staging link, an assignee, a date, and a review
comment. Around that sit a site-wide launch checklist, a page-wise QC matrix,
SEO meta per page, and a redirect list.

The app already holds half of this and does not know it. Sitemap scans and the
Webflow page sync produce the page list. Checklists, tasks and timelines exist
but sit beside the page list rather than on it. So the team maintains the same
pages twice, and the client sees only the spreadsheet.

This plan makes the page the unit of delivery, keeps the Google Sheet as the
thing clients open, and covers the four moments that actually matter: kickoff,
build, launch, handover.

Scope is website builds. The PeakXV SEO/AEO tracker and the metrics tracker are
retainer reporting, a different job, and are deliberately out.

## Decisions

| Decision | Choice |
| --- | --- |
| Google Sheet | The app owns page data; the Sheet is generated from it. Nobody edits the Sheet. |
| Client-facing artifact | The Sheet stays what clients open. The portal stays a light status page beside it. |
| QC depth | A short QC list per page, plus the site-wide global checklist. No 66×14 matrix. |
| Client messages | Removed. Kickoff already opens a Slack channel; a second inbox is worse than none. |
| Stacks | Webflow first, but nothing Webflow-specific outside a stack definition. |

The Sheet direction follows from one fact: the app can discover pages and a
spreadsheet cannot. If the Sheet owns the rows, someone maintains that list by
hand forever and it drifts from the real site. The cost is that typing status
into a web app is slower than a grid, so the page tracker must be an inline-edit
grid, and there is a one-time importer so projects already running in Sheets are
seeded rather than retyped.

## Shape

```
Stack            webflow | astro-sanity | next-storyblok   (definition, not code paths)
└─ Project
   ├─ Stage      kickoff → build → launch → handover
   ├─ Page       discovered from sitemap/Webflow, one row per page
   │   ├─ status per discipline: copy, design, dev desktop, dev mobile
   │   ├─ links: design (Figma), staging, docs
   │   ├─ assignee, expected date, review comment
   │   └─ QC: a short per-page list from the stack definition
   ├─ Global checklist   site-wide launch checks
   ├─ Kickoff            inputs needed from the client, internal setup, call cadence
   └─ Handover           walkthrough videos, launch record
```

A **stack definition** is one file per stack holding: the page disciplines, the
per-page QC list, the global launch checklist, and the kickoff input list. The
Webflow one is seeded from the existing SOP and the Keatech QC sheet. Adding
Astro+Sanity later means adding a definition, not touching feature code.

## Module 1 — Kickoff

Turns the SOP's "Input" and "Step 1" sections into something that runs.

- **Client inputs**: the twelve things needed from the client (ScreamingFrog
  scan, assets folder, paid Webflow account, domain registrar access, analytics
  codes, fonts, and the rest) become the project's ask list, published to the
  portal as "What we need from you". Today they live only in a checklist the
  client cannot see and have to be retyped as tasks.
- **Internal setup**: lead developer, backup developer, project lead, Slack
  channel, ClickUp list, MarkUp folder, internal kickoff. Stays a checklist.
- **Kickoff email**: a generated draft naming the team, the tracker link, the
  staging link and the agreed call cadence. Drafted in-app, sent by a person.
- **Call cadence**: weekly or biweekly stored on the project; drives a reminder
  when a sync has not happened, reusing the daily-review nudge machinery.

Kickoff completes when every client input is answered and the internal list is
done. That is what flips the project to **build**.

## Module 2 — Page tracker and the Sheet

- **Pages** come from the existing sitemap scan and Webflow sync. Each carries
  the disciplines from the stack definition, plus assignee, expected date,
  design link, staging link and review comment.
- **The grid** is the main screen: inline edit, keyboard navigation, filter by
  status or assignee, bulk set. It must be as fast as the spreadsheet it
  replaces or the team will not leave Sheets.
- **The Sheet** is generated: one tab matching the column layout already in use,
  so clients notice no change. Written on a schedule and after edits, via the
  Sheets API using the existing Firebase service account (the Sheets and Drive
  APIs are enabled on the same GCP project, the sheet is created in the service
  account's Drive and shared with the client).
- **Importer**: a one-time pull from an existing tracker sheet to seed page
  status, so Muffins and Keatech migrate without retyping.
- **Portal** gains a single line and a link: "14 of 26 pages built" and the
  tracker link. The Sheet stays the detail view.

## Module 3 — Launch

- **Global checklist** from the stack definition: the ~39 site-wide checks
  already in the Muffins sheet, grouped as content, functionality, post-launch.
- **Per-page QC** from the stack definition: the handful of checks that genuinely
  vary per page. Runs against the page list, so QC coverage is a number rather
  than a feeling.
- **Launch readiness** is one derived state: every page built, global checklist
  clear, per-page QC clear. Nothing is "ready" by assertion.
- Existing audit and scan data (broken links, missing meta, alt text) feeds the
  checks it can answer automatically instead of being ticked by hand.

## Module 4 — Handover

- Walkthrough video links per project, shown on the portal.
- A launch record: date, what shipped, redirects applied.
- Closes the project into retainer or done.

## What changes in what exists

- **Checklist Creator is rebuilt** around stack definitions. The current model is
  sections → items → one status, with no page axis, which is why it cannot hold
  the page-wise QC at all. The template library stays; what changes is that a
  template belongs to a stack and knows whether its items are site-wide or
  per-page.
- **Client messages are removed**: the route, the collection, the inbox, the
  reply form. The portal keeps status, plan, deliverables and the ask list.
- **Timeline phases stay** but stop being the client's progress indicator; page
  counts are the honest measure for a build.

## Phases

1. **Stack definitions and the page model.** Page type, per-discipline status,
   the Webflow stack definition seeded from the SOP and the Keatech QC sheet.
   Nothing user-facing. *(~2 days)*
2. **The page grid.** Inline-edit tracker on the project screen, fed by the
   existing page list. This is the piece the team lives in. *(~3 days)*
3. **Sheet generation and import.** Service-account Sheets access, generated
   tracker tab, scheduled write, one-time importer. *(~3 days)*
4. **Kickoff module.** Client inputs as portal asks, internal setup, call
   cadence, kickoff email draft. *(~2 days)*
5. **Launch module.** Global checklist, per-page QC, readiness state, automatic
   checks from existing scan data. *(~3 days)*
6. **Handover and cleanup.** Walkthrough videos, launch record, message-feature
   removal. *(~1 day)*

Phases 1 and 2 are worth doing on their own: they remove the duplicate page
list. Phase 3 is what lets the team stop opening Sheets.

## Open questions

- Who creates the client's Sheet today, and does it live in your Drive or
  theirs? The generated sheet is owned by the service account and shared out,
  which changes who can edit it.
- Are the disciplines always copy, design, dev desktop, dev mobile? Keatech uses
  content, desktop, mobile, and a separate breakpoint sheet for branding work.
- Do redirects and SEO meta belong in this system, or stay in the Sheet? Both
  already exist in the app in some form.
