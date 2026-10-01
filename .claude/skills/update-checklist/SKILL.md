---
name: update-checklist
description: Bring a project's delivery checklist up to date from the evidence (Fathom calls, the client Slack channel, Gmail, Calendar, the tracker sheet, Drive), fill its fields and ticks with dates and sources, and check what the client's page now shows. Use when asked to "update the checklist", "fill in the checklist", or keep a project's checklist current.
---

# Update a project's checklist from the evidence

The team ticks the Checklist and the client's page follows it, so a checklist
that is behind is a client page that is wrong. You are the agent who keeps it
current. You do the reading and the judging; `scripts/checklist.ts` only checks
your plan and writes it. No AI API is called by the app for this (Rehan,
2026-10-01: "I don't want API usage").

## 1. Know the project

```bash
npm run -s checklist -- context "<project name or id>"   # links, contacts, synced Fathom calls, sheet
npm run -s checklist -- show "<project>"                 # every item: id, status, date, fields, values, source
npm run -s checklist -- client "<project>"               # what the client's page shows right now
```

No checklist? Pick the engagement from the evidence (kickoff call, proposal,
Slack channel intro) and create it from the SOPs tagged with those services:
Brand Design, Copy, Web Design, Development (SOP ids in the Checklist Creator,
or `sop_templates` with `service`). Check none exists first, and say which you chose and why.

```bash
npm run -s checklist -- create "<project id>" <SOP id> <SOP id> --write
```

## 2. Gather the evidence

| Source | How | Good for |
| --- | --- | --- |
| Fathom calls already filed under the project | `checklist -- context` (summaries, dates, share links) | kickoff held on, recording link, decisions, agreed process, deadlines |
| Fathom, not yet filed | Fathom MCP `search_meetings` (needs `query` and `recorded_by`) or `list_meetings` (`created_after`) | calls the hourly sync missed (impromptu calls have no invitees, so they never sync). Its `get_meeting_summary` / `get_meeting_transcript` reject string ids here: open the call's share link (`fathom.video/share/…`, ask the user for it) in the built-in browser, no sign-in needed; `get_page_text` gives the summary, the Transcript tab the full transcript |
| Client Slack channel | Slack MCP `slack_search_channels` (client name), `slack_read_channel`, `slack_read_thread` | channel name, who joined (= invited), approvals ("let's go with Direction A"), assets received, review links, who leads |
| Gmail | `search_threads` | welcome email sent on, approvals in writing, handover sent on |
| Calendar | `search_events` | recurring sync (cadence, invite link), scheduled kickoff |
| Tracker / project sheet | Drive `read_file_content`, or the bound sheet in `context` | page progress, inputs received. Check the sheet belongs to this client |
| Earlier conversation | what the user said or showed you | values the team typed (screenshots), decisions they told you |

## 3. Write a plan

```json
{ "project": "<id>", "by": "<the lead>@activeset.co", "updates": [
  { "item": "<item id from show>", "status": "completed", "on": "2026-09-22",
    "values": { "held_on": "2026-09-22", "recording": "https://fathom.video/share/…" },
    "source": "Fathom: DreamTeam KickOff Call, 22 Sep" } ] }
```

Rules (the script enforces the starred ones):
- Only what the evidence shows. No evidence, no change: list it as missing instead.
- `on` is the day it happened, not today. The client sees that date. *
- Every update has a short `source` with a date; it is shown on the item. *
- Never untick, never replace a typed value, unless the user asked: then `"overwrite": true` and say so. *
- Values only into fields the item has (`show` lists them). *
- `skipped` only when the evidence puts it out of scope (e.g. the kickoff agreed no wireframes). Skipped steps disappear from the client's page.
- A client's step (Feedback on…, Direction chosen, Designs approved) is `in_progress` while it waits on them and `completed` on the day they answered.
- Don't move a stage on with guesses: an item that is merely "probably started" stays as it is.
- `by` is who did the work when known (`"by": "salman@activeset.co"` per update).

## 4. Apply and check

```bash
npm run -s checklist -- apply plan.json            # dry run: read every line
npm run -s checklist -- apply plan.json --write
npm run -s checklist -- client "<project>"         # does the page read true?
```

If the client's page says something untrue (wrong stage, a step done that is
not), fix the plan, not the page.

## 5. Report

Tell the user, briefly: what you filled and ticked (with the source), what is
still missing and who could answer it, and anything wrong you found on the way
(a link to another client's sheet, a channel name that does not exist).
Writes to anything outside the app (MarkUp, Slack, email, the client's sheet)
need the user's yes first.

## MarkUp

`MARKUP_API_KEY` is in `.env.local` (workspace "ActiveSet", one folder per client).

```bash
npm run -s markup -- folders                      # every client folder
npm run -s markup -- show "DreamTeam"             # its MarkUps, with review links
npm run -s markup -- create "Different AI" https://different-ai.webflow.io/product https://… [--sub "LP"]   # dry run
```

One MarkUp per page (the API cannot add a page to an existing one); `create`
skips a page that already has one in that folder. Creating is outward-facing:
show the dry run and ask before `--write`. Put the review links into the
checklist ("Create the MarkUp folder" → `markup`) and the Slack message the
user approves, not anywhere the client sees without the team's yes.
