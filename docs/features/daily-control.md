# Daily Control Loop

The Daily Control feature adds a reviewable operations layer for active client projects. It is intentionally internal-first: Slack signals, task risks, checklist gaps, timeline risk, QA gate state, and client-update drafts are collected in one Control tab, but no client-facing message is sent automatically.

## Entry Points

- Project detail `Control` tab: `/modules/project-links/[id]?tab=control`.
- Dashboard daily review banner: opens the next pending project on the Control tab.
- Cron route: `/api/cron/daily-control`.

## Project Settings

Daily Control settings are optional project fields:

- `slackChannelIds`: Slack channel IDs that may be imported for the project.
- `qaUrlSource`: `auto_links`, `manual_links`, or `custom`.
- `qaUrls`: custom QA URLs used when `qaUrlSource` is `custom`.
- `reviewOwnerEmail`: default internal owner for daily review.
- `clientUpdatePreferences`: internal notes that shape the draft client update.

V1 only imports configured project channels. DMs and unrestricted workspace ingestion are out of scope.

## Data Model

Slack-origin requests are stored in `requests` with optional source metadata:

- `source: "slack"`
- `slack.channelId`, `messageTs`, `messageUrl`, `authorName`
- `dedupeKey` as `channelId:messageTs`
- `sourceLink`, `pageUrl`, `isActionable`, `isBlocker`, `needsClientInput`, `confidence`

Tasks can carry the same operational metadata when accepted from parsed requests:

- `slack`, `dedupeKey`, `pageUrl`, `qaStatus`, `isBlocker`, `needsClientInput`, `confidence`

Daily state is persisted in `daily_control_snapshots` with one document per project/date. The snapshot includes new Slack signals, open blockers, overdue/no-date tasks, checklist gaps, timeline risk, QA results, and a draft client update.

## API Routes

- `POST /api/projects/[projectId]/slack/import`: imports deterministic actionable Slack messages from configured channels.
- `POST /api/projects/[projectId]/control/run`: optionally imports Slack, aggregates current project state, runs lightweight QA gate selection, and writes today's snapshot.
- `GET /api/projects/[projectId]/control/today`: returns today's snapshot if it exists.
- `POST /api/projects/[projectId]/client-update/draft`: regenerates the draft client update from the current snapshot.
- `GET /api/cron/daily-control`: runs the control loop for current tagged projects.

All project-scoped routes use project access checks. The cron route uses `CRON_SECRET` when configured.

For local UI work without Firebase Admin credentials, set `ACTIVESET_LOCAL_DEV_API_AUTH=true`. That bypass is accepted only in non-production localhost requests and only for local mock project IDs.

## Slack Import

Slack import requires `SLACK_BOT_TOKEN`. Missing Slack configuration returns a non-destructive result so daily control can still build a snapshot from existing tasks/checklists/timeline/audits.

Import behavior:

- Reads only `projects/{projectId}.slackChannelIds`.
- Dedupes messages by `channelId:messageTs`.
- Applies deterministic action/blocker/client-input filters before writing a request.
- Stores raw actionable messages for human review instead of creating tasks directly.

From the Control tab, an unparsed Slack signal can be converted into a local task after review. The task keeps the Slack source metadata and uses the existing task creation path, so projects with a linked ClickUp list continue to sync through the existing ClickUp flow.

## QA Gate Selection

The Control tab reuses existing link audit state rather than starting broad expensive scans. QA results are selected from the configured URL source and flag:

- missing audit data,
- failed scans,
- deploy blockers,
- low audit scores,
- missing core SEO fields,
- broken links.

Full visual checks and expensive scans should remain tied to changed/in-review pages or launch-gate workflows.

## Client Update Drafts

Drafts summarize:

- completed work,
- current work,
- blockers,
- client inputs needed,
- next dates,
- QA status.

The draft is internal and must be copied/approved by a project lead before sending.
