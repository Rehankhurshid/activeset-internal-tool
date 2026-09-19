# Delivery: the whole arc, from one SOP

## What is wrong today

The Webflow SOP has 11 sections and 75 items. The Delivery tab renders 4 of those
sections. Steps 2 through 6 — design prep, Webflow setup, CMS, page development,
integrations — and Step 8, client review and handover, appear nowhere in
Delivery. They exist only as rows in a flat 71-item list on another tab.

Brand Evolution has 9 sections and none of them are tagged, so a brand project
gets nothing from Delivery at all.

A task is one line of title text. There is no field for how to do it. The SOP
authors knew this and worked around it: URLs are crammed into title strings
(`Cookie Consent Banner: https://gr3f.co/c/60899/tFmEJ — Send this to client`)
where they render as unclickable plain text, and Brand Evolution stuffs guidance
into parentheticals. Of ~120 shipped items, zero carry a reference link, zero
carry a note, zero carry an image — because `makeItems`, the helper every built-in
section uses, accepts only title, emoji and autoCheck. The affordances exist in
the renderer and are dead in practice.

Worse, `instantiateTemplate` drops `notes`, `assignee`, `referenceLink` and
`hoverImage` when it copies a template onto a project. Guidance authored in a
template could not reach a project even if someone wrote it.

And nothing is connected. There are five people-facing lists of work — timeline
milestones, checklist items, tasks, requests, delivery pages — and not one
id-level link between them. Ticking a checklist item writes one field and tells
nothing else in the app. The only couplings that exist are a section's stage tag
and an item's scan signal.

## Decisions

Settled with Rehan on 2026-09-19:

1. **Delivery owns the arc.** It becomes the full start-to-end screen. The
   Checklist tab becomes the flat view of the same data.
2. **A task carries a short how-to and the links that do the job.** Not a
   long-form playbook, not video.
3. **All four loops**: stage gates, fixes flowing back to the template, a client
   review per stage, and nothing falling through.
4. **Any SOP, same machinery.** Stages come from the template's own sections in
   order, so Brand Evolution and Webflow both work with no code per template.

## The model

### Stages are the sections, in order

`ChecklistStage = 'kickoff' | 'launch'` goes away as the organising idea. Every
section is a stage. Webflow gets 11, Brand Evolution gets 9, a future
Astro+Sanity SOP gets whatever it has. Delivery renders a rail of them with
progress on each, and you move along it.

A section can also carry a **role**, which is the only thing the app hardcodes,
because a role is where the app does something beyond showing a list:

| Role | What Delivery does there |
| --- | --- |
| `kickoff` | Also shows the sync cadence and the welcome email draft |
| `pages` | Also shows the page grid — this is where the build happens |
| `client_review` | Ends with something the client sees and approves |
| `launch` | Readiness gate: derived from pages, per-page QC and this stage's items |

Roles are optional and several sections may share one. A section with no role is
an ordinary stage: a title, its items, its progress.

Existing data migrates: `stage: 'kickoff'` becomes role `kickoff`, `stage:
'launch'` becomes role `launch`. Nothing is lost and no project needs re-tagging.

### A task carries its context

Added to `ChecklistItem` and therefore to `SOPTemplateItem`:

- `howTo?: string` — a few lines on what to actually do. Plain text, shown
  inline under the title, not behind a hover.
- `links?: { label: string; url: string }[]` — the tools and references, each
  with a label so you know what you are clicking. Replaces the single unlabelled
  `referenceLink`, which is kept and migrated.
- `blocking?: boolean` — must be settled before the stage can close.
- `dueDate?: string` — so something can be overdue.

The shipped SOP is rewritten to use them: every URL currently inside a title
moves into `links`, and the decision trees compressed into single lines
(`Folder for the Assets (Drive). If not, scrape using…`) move into `howTo`.

### The four loops

**Stage gates.** A stage is complete when every blocking item is settled. The
next stage opens when the one before it completes. Derived from the items, never
a button someone presses, which is the same rule launch readiness already
follows.

**Fixes flow back.** When you improve a task's how-to on a live project, an
action offers to push it back to the SOP template it came from, so the next
project inherits it. Today the copy is one-way and every lesson dies with the
project. Matching is by section title and item title against the template named
in `ProjectChecklist.templateId`.

**Client review.** A section with role `client_review` surfaces on the portal:
what is ready, and an approval that closes the stage.

**Nothing falls through.** Items get an owner and a due date. Anything overdue or
blocked surfaces on the stage rail and on the dashboard, rather than waiting to
be found. The nag bot reads only the `tasks` collection today and has to learn
about checklist items.

## Phases

1. ~~**The spine.**~~ Done. Stages from sections, roles, the migration, the rail.
2. ~~**Context on tasks.**~~ Done. `howTo` and `links`, the carry-through fixes,
   the Creator's item editor, the SOP rewrite.
3. ~~**Gates and ownership.**~~ Done. Blocking items, gates, due dates, an
   overdue marker on the stage rail, and the nag bot, which now reads delivery
   steps as well as the `tasks` collection. Only steps with both an assignee and
   a due date take part: a Webflow SOP is seventy-odd steps, and the staleness
   rule that works for tasks would put most of them in Slack on day four.
4. ~~**The template feedback loop.**~~ Done. `delivery.feedback.ts` diffs a
   project's checklist against its source template and offers the guidance back;
   built-in templates are code and are refused with an explanation.
5. ~~**Client review stages.**~~ Done. A `client_review` stage appears on the
   portal as one button; approving writes `delivery.approvals` through a narrow
   token-authed route and ticks nothing internal.

Added along the way, not in the original plan: **the agency basics**. Slack, the
welcome email, the cadence and the walkthrough were only in the Webflow SOP, so a
brand project got none of them.

First attempt wrapped them around the two built-in templates in code, which
reached almost nothing — every real project runs from a template somebody wrote
in the Checklist Creator. They are now applied when a checklist is created,
whatever template it came from, and an existing project can pull in what it is
missing from the Delivery tab. A checklist is a deep copy, so nothing else would
have reached the projects already running.

## Bugs found on the way, to fix in phase 2

- `instantiateTemplate` drops `notes`, `assignee`, `referenceLink`, `hoverImage`.
- The Creator's Markdown round-trip destroys `notes` and `assignee`; the tab
  switch replaces the whole sections array, so flipping Visual → Markdown →
  Visual deletes every note. `stage` and `autoCheck` were fixed already.
- The Creator's item editor exposes only title, emoji, link and image — no notes,
  no assignee, no scan signal.
- `makeItems` cannot express guidance, which is why no shipped item has any.
- `ChecklistItem.autoCheck` is invisible on the Checklist tab.
- `ProjectPage.sourceLinkId` is written and never read; the audit join is done by
  path string, so a re-scanned link silently loses its audit.
- `ClientFacingState.openRequestCount` is declared, never written, never read.
- `ChecklistProgressBadge` is imported nowhere.
- `@tiptap/*` is in package.json and imported nowhere.
- A comment in `firestore.rules` claims page progress reaches the client portal.
  It does not; the projection never receives pages.
