---
module: clickup-tasks
title: Tasks, Requests and ClickUp Sync (plus the Slack nag-bot)
keywords: [tasks, task, requests, request, Tasks tab, New Request, quick add, AI parse, parse-request, ClickUp, clickup, list link, link list, Sync local, Create in ClickUp, Unlink, webhook, X-Signature, HMAC, register webhook, rotate secret, clickup-refresh, drift cron, mirror, dedupe, subtasks, parentClickupTaskId, clickupSyncRequestId, sync lock, clickupSyncInFlightAt, clickupSyncError, retry sync, assignee, workspace members, nag-bot, nag, Slack, task wingman, test-nag, NAG_TEAM_EMAILS, billable, billing mode, hourly, fixed, task-billing, ClickUp Settings]
entry_points: [/modules/project-links/[id]?tab=tasks, /modules/clickup-settings, /share/project-links/[token]]
code_roots: [src/components/tasks, src/app/api/clickup, src/app/api/tasks, src/app/api/cron/clickup-refresh, src/app/api/cron/nag-tasks, src/app/modules/clickup-settings, src/lib]
last_verified: 2026-09-23 @ a00f91e
---
# Tasks, Requests and ClickUp Sync

> Each project has a **Tasks** tab: a table of trackable work items (`tasks` collection), optionally created by pasting a client message that Gemini splits into tasks (the original message is saved as a `requests` doc). A project can be bound to one ClickUp list. Once bound, the list is bulk-imported, new local tasks are pushed to ClickUp, local edits to title/description/status/priority/due date/assignee are pushed to ClickUp, and ClickUp changes flow back via a signed webhook plus a 15-minute drift cron. Separately, a Slack "nag-bot" cron pings team members twice each weekday about upcoming, overdue and stale tasks (and dated Delivery checklist steps). Team members use the Tasks tab. Admins use `/modules/clickup-settings` to register the webhook and test the nag-bot. A read-only Tasks tab also shows on the public share page.

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Change the Tasks tab layout, summary strip, quick add | [TasksTab.tsx](../../src/components/tasks/TasksTab.tsx) `TasksTab` |
| Change table columns, filters, inline editors, subtask grouping | [TaskTable.tsx](../../src/components/tasks/TaskTable.tsx) `TaskTable` (the `ordered` memo groups subtasks under parents) |
| Change the paste-a-message → AI tasks dialog | [NewRequestDialog.tsx](../../src/components/tasks/NewRequestDialog.tsx) `NewRequestDialog` |
| Change the AI prompt/schema for splitting a message | [api/tasks/parse-request/route.ts](../../src/app/api/tasks/parse-request/route.ts) `SYSTEM_PROMPT`, `taskSuggestionSchema` |
| Change the project-level "link a ClickUp list" card / "Sync local" | [ClickUpListLinkCard.tsx](../../src/components/tasks/ClickUpListLinkCard.tsx) `ClickUpListLinkCard` |
| Change the per-task link / create / unlink dialog | [ClickUpLinkDialog.tsx](../../src/components/tasks/ClickUpLinkDialog.tsx) `ClickUpLinkDialog` |
| Change client-side task CRUD and the fire-and-forget ClickUp pushes | [database.ts](../../src/services/database.ts) `tasksService` (`createTask`, `createTasksBatch`, `updateTask`, `retryClickUpSync`, `subscribeToProjectTasks`), `pushNewTasksToClickUp`, `pushUpdateToClickUp` |
| Change which fields are pushed app → ClickUp | [database.ts](../../src/services/database.ts) `CLICKUP_PUSHABLE_FIELDS` + [clickup-sync-update.ts](../../src/lib/clickup-sync-update.ts) `buildClickUpUpdateBody` |
| Change how ClickUp fields map into a local task | [clickup.ts](../../src/lib/clickup.ts) `clickUpTaskToUpdate`, `mapClickUpStatus`, `mapClickUpPriority` |
| Change how local status maps to a ClickUp list status | [clickup.ts](../../src/lib/clickup.ts) `taskStatusToClickUpStatus` |
| Change the create-in-ClickUp lock / reconcile logic | [clickup-sync-create.ts](../../src/lib/clickup-sync-create.ts) `syncCreatedTasksToClickUp` |
| Change the outbound update / stale-request logic | [clickup-sync-update.ts](../../src/lib/clickup-sync-update.ts) `syncTaskUpdateToClickUp` |
| Change what happens on a ClickUp webhook event | [api/clickup/webhook/route.ts](../../src/app/api/clickup/webhook/route.ts) `handleVerifiedEvent` |
| Change webhook signature checking | [clickup.ts](../../src/lib/clickup.ts) `verifyClickUpSignature` |
| Change duplicate-mirror cleanup (delete vs unlink) | [clickup-local-mirrors.ts](../../src/lib/clickup-local-mirrors.ts) `chooseCanonicalClickUpDoc`, `isDisposableClickUpMirror`, `buildClickUpUnlinkPatch` |
| Change the 15-min drift refresh / webhook self-heal | [api/cron/clickup-refresh/route.ts](../../src/app/api/cron/clickup-refresh/route.ts) `ensureWebhookHealthy`, `GET` |
| Change the list bulk import | [api/clickup/link-list/route.ts](../../src/app/api/clickup/link-list/route.ts) `POST` |
| Change the assignee dropdown source | [useAssignees.ts](../../src/hooks/useAssignees.ts) (calls `/api/clickup/members`, falls back to access control) |
| Change nag-bot selection rules, tone tiers, Slack blocks | [nag-bot.ts](../../src/lib/nag-bot.ts) `runNagBot`, `loadChecklistNags`, `tierFor`, `generateRoast`, `buildBlocks` |
| Change who counts as "team" for nags | [team.ts](../../src/lib/team.ts) `isTeamMember` |
| Change the admin ClickUp settings page | [clickup-settings/page.tsx](../../src/app/modules/clickup-settings/page.tsx) `ClickUpSettingsPage` |
| Change billable-task pricing math | [task-billing.ts](../../src/lib/task-billing.ts) `taskToLineItem`, `taskBillAmount`, `resolveTaskBillingMode` |
| Change Task / ProjectRequest types | [types/index.ts](../../src/types/index.ts) `Task`, `ProjectRequest`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `TaskSource` |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/project-links/[id]` (Tasks tab, `?tab=tasks`) | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) renders `TasksTab` (dynamic import, `ssr:false`) | Summary strip (Open / Urgent / Assigned to me / Requests / New since last visit), quick add, **New Request** button, ClickUp list card, task table. Billing columns (Billable / Type / Hours / Amount / Invoiced) only when the project is ad-hoc (`billingEnabled={isAdhoc}`) | Signed-in `@activeset.co` user (project-links module) |
| `/modules/clickup-settings` | [clickup-settings/page.tsx](../../src/app/modules/clickup-settings/page.tsx) | Webhook status (registered, team id, endpoint, secret present), Register / Re-register (rotate secret) / Unregister, "Test the Nag-Bot" | Client-side `isAdmin` gate from `useAuth`; server routes enforce `requireAdmin`. Reached via the Command Palette ("ClickUp settings", [CommandPalette.tsx](../../src/components/CommandPalette.tsx)) |
| `/share/project-links/[token]` | [SharedProjectTabs.tsx](../../src/app/share/project-links/[token]/SharedProjectTabs.tsx) renders `<TasksTab readOnly />` | Read-only task table; no quick add, no ClickUp card, no editors | Anyone with the share token (reads via client SDK; `tasks`/`requests` rules allow public read) |

## API routes

All routes are `runtime = 'nodejs'` and use firebase-admin. "Firebase ID token" means `Authorization: Bearer <id token>` verified by `requireCaller` in [api-auth.ts](../../src/lib/api-auth.ts) (only `@activeset.co`). `requireProjectAccess` adds only "project exists". Admin = `ADMIN_EMAILS` in api-auth.ts or an `admin` custom claim.

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| POST | `/api/clickup/link` | [link/route.ts](../../src/app/api/clickup/link/route.ts) | Firebase ID token + `requireProjectAccess` | Link one local task to an existing ClickUp task (URL or id). Fetches it, overwrites local fields from ClickUp, sets `source:'clickup'`. 409 if another local task already has that `clickupTaskId` |
| DELETE | `/api/clickup/link?taskId=&projectId=` | same | same | Unlink one task (clears `clickupTaskId/Url/SyncedAt`, sync state; sets `source:'manual'`) |
| POST | `/api/clickup/link-list` | [link-list/route.ts](../../src/app/api/clickup/link-list/route.ts) | Firebase ID token + `requireProjectAccess` | Bind `projects/{id}.clickupListId/Name`, then bulk-import every open task and subtask in the list (create or update mirrors, dedupe). 409 if the list is bound to another project. `maxDuration` 180 |
| DELETE | `/api/clickup/link-list?projectId=` | same | same | Unbind the list (sets `clickupListId/Name` to null). Per-task links stay |
| GET | `/api/clickup/members` | [members/route.ts](../../src/app/api/clickup/members/route.ts) | Firebase ID token (`requireCaller`) | Sorted unique emails of ClickUp workspace members, for the assignee dropdown. Team id: `app_secrets/clickup.teamId` → `CLICKUP_TEAM_ID` → first team |
| GET | `/api/clickup/register-webhook` | [register-webhook/route.ts](../../src/app/api/clickup/register-webhook/route.ts) | Firebase ID token + `requireAdmin` | Registration status from `app_secrets/clickup` |
| POST | `/api/clickup/register-webhook` | same | same | Delete any existing ClickUp webhook on the same endpoint, create a new one for `CLICKUP_TASK_EVENTS`, store `teamId/webhookId/webhookSecret/endpoint/events/registeredAt`. Body: optional `teamId`, `endpointOverride` |
| DELETE | `/api/clickup/register-webhook` | same | same | Delete the webhook in ClickUp and null out the stored id/secret/endpoint |
| POST | `/api/clickup/sync-create` | [sync-create/route.ts](../../src/app/api/clickup/sync-create/route.ts) | Firebase ID token + `requireProjectAccess` | Push local tasks `{projectId, taskIds[]}` to the bound list as new ClickUp tasks (`syncCreatedTasksToClickUp`) |
| POST | `/api/clickup/sync-update` | [sync-update/route.ts](../../src/app/api/clickup/sync-update/route.ts) | Firebase ID token + `requireProjectAccess` | Push a partial patch (or `forceFullState`) of a linked task to ClickUp (`syncTaskUpdateToClickUp`) |
| POST | `/api/clickup/test-nag` | [test-nag/route.ts](../../src/app/api/clickup/test-nag/route.ts) | Firebase ID token + `requireAdmin` | Run the nag-bot in test mode: every message is DMed to the caller's Slack account, nobody else is pinged |
| POST | `/api/clickup/webhook` | [webhook/route.ts](../../src/app/api/clickup/webhook/route.ts) | HMAC-SHA256 `X-Signature` over the raw body, secret from `app_secrets/clickup.webhookSecret` | Inbound ClickUp task events. Returns 401 only on bad signature, 200 for everything else |
| POST | `/api/tasks/parse-request` | [parse-request/route.ts](../../src/app/api/tasks/parse-request/route.ts) | Firebase ID token + `requireProjectAccess` | `{rawText, projectId, sender?}` → up to 25 `ParsedTaskSuggestion`s via `generateObject`. Writes nothing |
| GET | `/api/cron/clickup-refresh` | [cron/clickup-refresh/route.ts](../../src/app/api/cron/clickup-refresh/route.ts) | Cron secret (`isCronAuthorized`) | Webhook health check + re-register, then refresh up to 200 linked tasks from ClickUp |
| GET | `/api/cron/nag-tasks` | [cron/nag-tasks/route.ts](../../src/app/api/cron/nag-tasks/route.ts) | Cron secret (`isCronAuthorized`) | Run the nag-bot for real (`runNagBot()`); 503 if Slack or admin not configured |

Related routes owned by other areas that call this module's libs: `/api/raycast/projects/[projectId]/tasks` calls `syncCreatedTasksToClickUp`, and `/api/raycast/assignees` calls `fetchTeamMembers`. `/api/refrens/invoices/from-tasks` calls `taskToLineItem`.

## Code map

### Module dir
There is no `src/modules/tasks` or `src/modules/clickup`. The feature is spread across `src/components/tasks`, `src/lib/clickup*.ts`, `src/services/database.ts` and the routes above. The only page is [src/app/modules/clickup-settings/page.tsx](../../src/app/modules/clickup-settings/page.tsx) (`ClickUpSettingsPage`, admin UI for the webhook and the nag-bot test; uses `fetchAuthed`).

### Components (`src/components/tasks/`)
- [TasksTab.tsx](../../src/components/tasks/TasksTab.tsx): `TasksTab`, the tab shell. Computes counters, `syncableTaskIds` (unlinked and not in-flight), quick add (`tasksService.createTask` with `source:'manual'`, `status:'todo'`, `priority:'medium'`, `category:'other'`). Props `readOnly`, `billingEnabled`, `hourlyRate`, `billingCurrency`.
- [TaskTable.tsx](../../src/components/tasks/TaskTable.tsx): `TaskTable` (TanStack table). Search, status filter (default "Open (not done)"), priority filter, inline status/priority/assignee/due-date editors (`tasksService.updateTask`), delete, "Source" column with ClickUp link/state and a retry button when `clickupSyncError` is set (`tasksService.retryClickUpSync`). Subtasks are placed under their parent when the parent is visible. Billing cells (`BillingHoursCell`, `BillingAmountCell`) are locked once `invoiceId` is set. Also `DueDateCell`, `SortableHeader`.
- [NewRequestDialog.tsx](../../src/components/tasks/NewRequestDialog.tsx): `NewRequestDialog`. Paste text, choose source (`paste`/`slack`/`email`) and sender, call `/api/tasks/parse-request`, edit the suggestions, then save: `requestsService.createRequest` → `tasksService.createTasksBatch` (each with `requestId`) → `requestsService.markRequestParsed`.
- [ClickUpListLinkCard.tsx](../../src/components/tasks/ClickUpListLinkCard.tsx): `ClickUpListLinkCard`. Link a list (POST `/api/clickup/link-list`), **Sync local** (POST `/api/clickup/sync-create` with all syncable ids), unlink the list, and counters (ClickUp rows / Local rows / Pending / Issues).
- [ClickUpLinkDialog.tsx](../../src/components/tasks/ClickUpLinkDialog.tsx): `ClickUpLinkDialog`. Per task: **Create in ClickUp** (sync-create for one id), link an existing URL/id (POST `/api/clickup/link`), **Unlink** (DELETE `/api/clickup/link`). Shows the last sync error.
- [TaskBadges.tsx](../../src/components/tasks/TaskBadges.tsx): `TaskStatusBadge`, `TaskPriorityBadge`, `TaskNeedsClientBadge`, `TaskCategoryBadge`.
- [clickupSyncState.ts](../../src/components/tasks/clickupSyncState.ts): `CLICKUP_SYNC_LOCK_TTL_MS` (2 min, mirrors the server lock) and `isClickUpCreateSyncPending`.

### Hooks
- [useProjectTasks.ts](../../src/hooks/useProjectTasks.ts): `useProjectTasks(projectId)` wraps `tasksService.subscribeToProjectTasks`, which runs a real-time `where('projectId','==',id)` query, dedupes ClickUp mirrors client-side (`dedupeClickUpMirrors`) and sorts by status order (in_progress, in_review, todo, backlog, blocked, done), then `order`.
- [useProjectRequests.ts](../../src/hooks/useProjectRequests.ts): `useProjectRequests(projectId)` wraps `requestsService.subscribeToProjectRequests`, sorted newest `receivedAt` first.
- [useAssignees.ts](../../src/hooks/useAssignees.ts): assignee emails from `/api/clickup/members`, falling back to the access-control doc.

### Services
- [database.ts](../../src/services/database.ts) section "TASKS & REQUESTS":
  - `taskFromDoc`, `requestFromDoc`: Firestore → typed objects.
  - `tasksService.createTask` / `createTasksBatch`: client SDK writes. Each new task gets a `clickupSyncRequestId` (random UUID) and `clickupSyncRequestedAt`, then fires `pushNewTasksToClickUp` (POST sync-create with the user's ID token). This runs even when no list is bound; the server returns `skipped:'list-not-bound'`.
  - `tasksService.updateTask`: turns an explicit `undefined` into `deleteField()` for assignee/dueDate/billing fields. Auto-sets or clears `completedAt`. If any `CLICKUP_PUSHABLE_FIELDS` key (`title, description, status, priority, dueDate, assignee`) is present, it stamps a new `clickupSyncRequestId`, clears the sync error, re-reads the doc, and fires `pushUpdateToClickUp` if the task is linked.
  - `tasksService.deleteTask`: deletes the local doc only. Nothing is sent to ClickUp.
  - `tasksService.retryClickUpSync`: sync-update `forceFullState` if linked, otherwise sync-create. Throws on failure.
  - `requestsService.createRequest` (status `new`, `taskIds: []`), `markRequestParsed` (status `parsed`, `parsedAt`, `taskIds`), `subscribeToProjectRequests`.

### Lib
- [clickup.ts](../../src/lib/clickup.ts) (`server-only`): ClickUp REST v2 client (`clickupRequest`, `ClickUpError`). Parsing: `parseClickUpTaskId`, `parseClickUpListId`, `buildClickUpTaskUrl`. Reads: `fetchClickUpTask`, `fetchClickUpList`, `listTasksInList` (100 per page, max 50 pages), `fetchTeamMembers`, `listTeams`. Writes: `createClickUpTask`, `updateClickUpTask`. Mapping: `mapClickUpStatus`, `mapClickUpPriority`, `taskPriorityToClickUp`, `taskStatusToClickUpStatus`, `isoDateToClickUpMs`, `clickUpTaskToUpdate`, `buildEmailToClickUpIdMap`. Webhooks: `verifyClickUpSignature`, `createWebhook`, `listWebhooks`, `deleteWebhook`, `CLICKUP_TASK_EVENTS`, `ClickUpWebhookPayload`.
- [clickup-sync-create.ts](../../src/lib/clickup-sync-create.ts): `syncCreatedTasksToClickUp(projectId, taskIds)`. Per task: claim a lock in a transaction, re-read, create in ClickUp, link back in a transaction, and reconcile with a full-state update if the user edited the task while the create was in flight. Returns `SyncCreateResult[]`.
- [clickup-sync-update.ts](../../src/lib/clickup-sync-update.ts): `syncTaskUpdateToClickUp(projectId, taskId, {patch, expectedRequestId, forceFullState})`. Builds the PUT body (status name lookup, priority enum, due-date epoch, assignee add/rem diff), pushes it, and finalizes in a transaction. If a newer local edit landed meanwhile, it retries with full state (max 3 attempts). `SyncUpdatePatch`, `SyncUpdateResult`.
- [clickup-local-mirrors.ts](../../src/lib/clickup-local-mirrors.ts): `localClickUpTaskDocFromSnapshot`, `chooseCanonicalClickUpDoc` (prefers no sync error, then latest `clickupSyncedAt`, `updatedAt`, `createdAt`), `isDisposableClickUpMirror` (`source==='clickup'` or `createdBy==='clickup-sync@system'`), `buildClickUpUnlinkPatch`.
- [nag-bot.ts](../../src/lib/nag-bot.ts) (`server-only`): `runNagBot(opts)`, `RunNagBotResult`, `AssigneeResult`. See Background jobs.
- [task-billing.ts](../../src/lib/task-billing.ts): shared by TaskTable, the invoices `GenerateFromTasksCard` and the Refrens from-tasks route. `resolveTaskBillingMode` (default `hourly`), `taskToLineItem(task, projectHourlyRate)` (fixed → qty 1 × `billedAmount`; hourly → `billedHours` (default 1) × `billedRate ?? projectHourlyRate`; `null` if it cannot be priced), `taskBillAmount`.
- Supporting, owned elsewhere: [slack.ts](../../src/lib/slack.ts) (`postMessage`, `lookupUserIdByEmail`, `mention`, `SlackError`), [team.ts](../../src/lib/team.ts) (`isTeamMember`), [base-url.ts](../../src/lib/base-url.ts) (`getBaseUrl`, used for checklist nag links), [cron-auth.ts](../../src/lib/cron-auth.ts), [api-auth.ts](../../src/lib/api-auth.ts), [api-client.ts](../../src/lib/api-client.ts) (`fetchForProject`, `fetchAuthed`).

### Types
[types/index.ts](../../src/types/index.ts): `Task`, `CreateTaskInput`, `UpdateTaskInput`, `ProjectRequest`, `RequestSource` (`paste|slack|email`), `RequestStatus` (`new|parsed|archived`), `ParsedTaskSuggestion`, `TaskCategory` (`fix|feature|copy|design|bug|content|other`), `TaskStatus` (`backlog|todo|in_progress|in_review|done|blocked`), `TaskPriority` (`low|medium|high|urgent`), `TaskSource` (`manual|paste|slack|email|clickup`), `TaskBillingMode`, the label maps, `TASK_CATEGORIES/STATUSES/PRIORITIES`, `CLICKUP_SYNCED_FIELDS` (unused). `Project.clickupListId` / `clickupListName` are also defined here.

## Data model

| Path | One doc = | Key fields (type, file) | Writers | Readers |
|---|---|---|---|---|
| `tasks/{taskId}` (`COLLECTIONS.TASKS`) | One work item, flat top-level collection keyed by an auto id, scoped by `projectId` | `Task` in [types/index.ts](../../src/types/index.ts): `projectId, requestId?, title, description?, category, status, priority, dueDate? (YYYY-MM-DD), tags[], source, assignee? (email), order, createdBy, createdAt, updatedAt, completedAt?`; billing `billable, billingMode, billedHours, billedRate, billedAmount, invoiceId, invoiceNumber, invoicedAt`; ClickUp `clickupTaskId, parentClickupTaskId, clickupUrl, clickupSyncedAt, clickupSyncError, clickupSyncFailedAt, clickupSyncInFlightAt`; plus untyped `clickupSyncRequestId`, `clickupSyncRequestedAt`, `clickupLastSyncedRequestId` | Client SDK (`tasksService`); firebase-admin in the webhook, link, link-list, sync-create/update, clickup-refresh cron; also Raycast ([raycast-projects.ts](../../src/lib/raycast-projects.ts)) and invoicing ([adhoc-invoicing.repository.ts](../../src/modules/invoices/infrastructure/adhoc-invoicing.repository.ts)) | Client SDK (Tasks tab, share page); admin: nag-bot, [delivery-nudge.ts](../../src/lib/delivery-nudge.ts), [client-portal.ts](../../src/lib/client-portal.ts), Raycast |
| `requests/{requestId}` (`COLLECTIONS.REQUESTS`) | One raw incoming message that was AI-parsed into tasks | `ProjectRequest`: `projectId, rawText, source, sender?, status, taskIds[], receivedAt, parsedAt?, createdBy` (+ optional Slack/dedupe/confidence fields that nothing in this module sets) | Client SDK only (`requestsService`, from `NewRequestDialog`) | Client SDK (`useProjectRequests`, which only feeds the "Requests" count) |
| `projects/{projectId}` fields `clickupListId`, `clickupListName` | The project's ClickUp list binding | `Project` in types/index.ts | Admin, `/api/clickup/link-list` POST/DELETE | Webhook (`findProjectForList`, moved-out check), cron, sync-create/update, TasksTab props, dashboard "connected systems" count |
| `app_secrets/clickup` (`COLLECTIONS.APP_SECRETS`) | Singleton webhook state | `teamId, webhookId, webhookSecret, endpoint, events, registeredAt` (no TS type; `ClickUpAppSecrets` locally in webhook/route.ts) | Admin: register-webhook POST/DELETE, clickup-refresh `ensureWebhookHealthy` | Admin: webhook (secret), members, sync-create/update (`teamId`), Raycast assignees |
| `project_checklists/{id}` (read only here) | A project's Delivery SOP | `projectId, sections[].items[].{id,title,status,assignee,dueDate}`, `createdAt` | Checklists/delivery module | nag-bot `loadChecklistNags` (reads the whole collection) |

- **Rules** ([firestore.rules](../../firestore.rules)): `tasks/{id}` and `requests/{id}` have `allow read: if true; allow write: if isActiveSetUser();` because the public share page reads them from the browser. `app_secrets` is not listed, so it is denied to clients by default (the rules file says so explicitly). Covered by [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) (the loop over `tasks`, `project_timelines`, `project_checklists`, `requests`).
- **Indexes** ([firestore.indexes.json](../../firestore.indexes.json)): no composite index for `tasks` or `requests`. Every query is single-field: `projectId ==`, `clickupTaskId ==` / `in` / `!= null`, `status != 'done'`, and `projects.clickupListId ==`.
- firebase-admin is built with `ignoreUndefinedProperties: true` ([firebase-admin.ts](../../src/lib/firebase-admin.ts) comment at line 174), so ClickUp patches with `undefined` fields do not throw.
- No Storage use.

## Background jobs

| Job | Schedule ([vercel.json](../../vercel.json)) | Route | Auth | What it does |
|---|---|---|---|---|
| ClickUp drift refresh | `*/15 * * * *` | `/api/cron/clickup-refresh` | `CRON_SECRET` Bearer or `x-cron-secret` | (1) `ensureWebhookHealthy`: list the team's webhooks. If ours is missing or `health.status==='failing'`, delete it and re-create it at the **stored** `endpoint`, then save the new id/secret. (2) Load up to 200 tasks with `clickupTaskId != null`, group by ClickUp id, keep one canonical doc and delete or unlink the duplicates. (3) Per canonical task, with 200 ms spacing: if a local edit is pending (`clickupSyncRequestId !== clickupLastSyncedRequestId`), push local full state; otherwise fetch from ClickUp, unlink/remove if it moved to another list, or apply the inbound patch. A 404 removes or unlinks it. Returns `{examined, synced, unlinked, deduped, errors, webhook}` |
| Nag-bot | `0 14,19 * * 1-5` (UTC; 10:00/15:00 EDT, 09:00/14:00 EST) | `/api/cron/nag-tasks` | `CRON_SECRET` | `runNagBot()` in [nag-bot.ts](../../src/lib/nag-bot.ts): see below |
| ClickUp webhook | push, on ClickUp task events | `/api/clickup/webhook` | HMAC `X-Signature` | Events registered: `taskCreated, taskUpdated, taskDeleted, taskStatusUpdated, taskPriorityUpdated, taskAssigneeUpdated, taskDueDateUpdated, taskTagUpdated, taskMoved` ([clickup.ts](../../src/lib/clickup.ts) `CLICKUP_TASK_EVENTS`) |

**Nag-bot selection** (`runNagBot`, [nag-bot.ts](../../src/lib/nag-bot.ts) line 454):
1. Needs firebase-admin credentials, `SLACK_BOT_TOKEN`, and `SLACK_CHANNEL_ID` (or a test recipient).
2. Tasks come from `tasks where status != 'done'` across all projects. Each needs an assignee that `isTeamMember` accepts (`@activeset.co` or in `NAG_TEAM_EMAILS`); others count as `skippedNonTeam`. A task with a due date is kept if it is overdue, due today, or due within `UPCOMING_WINDOW_DAYS` = 3. A task without a due date is kept if it was created at least `STALE_DAYS` = 3 days ago (sentinel `daysOverdue = -100`).
3. Checklist steps (`loadChecklistNags`, line 388) need an assignee **and** a due date and must not be `completed`/`skipped`. They link to `${getBaseUrl()}/modules/project-links/{id}?tab=delivery`.
4. Items whose project `status` is in `closed|paid|paused` are dropped (`DORMANT_PROJECT_STATUSES`, line 165). A missing status counts as live.
5. Items are grouped per assignee and sorted by urgency, then priority, then age. `tierFor(max daysOverdue)` picks one of 7 tone tiers (early-bird … storybook). `generateRoast` calls `generateText` with `NAG_AI_MODEL` (default `google/gemini-2.5-flash`, temperature 0.95) and falls back to canned text on error.
6. Production posts to `SLACK_CHANNEL_ID` with an @mention **and** DMs the person (Slack id from `lookupUserIdByEmail`). Either one succeeding counts as posted. Test mode sends one DM per assignee to the admin, with a header and no real pings. Task links use `clickupUrl` (unlinked tasks show no link).

## Configuration

| Env var | Required? | Used in |
|---|---|---|
| `CLICKUP_API_TOKEN` | Yes, for any ClickUp call (personal token, sent raw in `Authorization`) | [clickup.ts](../../src/lib/clickup.ts) `getApiToken` |
| `CLICKUP_TEAM_ID` | Optional. Fallback workspace id when `app_secrets/clickup.teamId` is absent (members); first choice when the register body has no `teamId` | [members/route.ts](../../src/app/api/clickup/members/route.ts), [register-webhook/route.ts](../../src/app/api/clickup/register-webhook/route.ts), `/api/raycast/assignees` |
| `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` | Used to build the webhook endpoint when registering (`originForRequest`); falls back to the request origin | [register-webhook/route.ts](../../src/app/api/clickup/register-webhook/route.ts) line 28 |
| `SLACK_BOT_TOKEN` | Yes, for the nag-bot and test-nag (needs `chat:write`, `users:read.email`) | [slack.ts](../../src/lib/slack.ts), [nag-bot.ts](../../src/lib/nag-bot.ts), [test-nag/route.ts](../../src/app/api/clickup/test-nag/route.ts) |
| `SLACK_CHANNEL_ID` | Yes for production nags | [nag-bot.ts](../../src/lib/nag-bot.ts), [slack.ts](../../src/lib/slack.ts) |
| `NAG_TEAM_EMAILS` | Optional, comma-separated non-`@activeset.co` addresses that count as team | [team.ts](../../src/lib/team.ts) |
| `NAG_AI_MODEL` | Optional, default `google/gemini-2.5-flash` | [nag-bot.ts](../../src/lib/nag-bot.ts) |
| `PROPOSAL_AI_MODEL` | Optional, default `google/gemini-2.5-flash` (shared with the proposal AI routes) | [parse-request/route.ts](../../src/app/api/tasks/parse-request/route.ts) |
| `CRON_SECRET` | Yes in production (fail-closed) | [cron-auth.ts](../../src/lib/cron-auth.ts) |
| `NEXT_PUBLIC_BASE_URL` / `APP_BASE_URL` | Optional, origin for checklist nag links | [base-url.ts](../../src/lib/base-url.ts) |

- Stored config: `app_secrets/clickup` (webhook secret and team id). There is no per-project ClickUp token; one workspace token serves every project.
- AI calls pass a plain `"provider/model"` string to the `ai` package (`generateText`/`generateObject`), so they go through the Vercel AI Gateway. Gateway credentials are read implicitly by the SDK, not via `process.env` in this code.
- No feature flags.

## External services

| Service | How | File | Auth |
|---|---|---|---|
| ClickUp REST API v2 (`https://api.clickup.com/api/v2`) | `fetch` with `cache:'no-store'`. Endpoints: `GET/PUT /task/{id}`, `GET /list/{id}`, `GET /list/{id}/task`, `POST /list/{id}/task`, `GET /team`, `GET /team/{id}`, `GET/POST /team/{id}/webhook`, `DELETE /webhook/{id}` | [clickup.ts](../../src/lib/clickup.ts) | `Authorization: <CLICKUP_API_TOKEN>` |
| ClickUp webhooks (inbound) | POST to `/api/clickup/webhook` | [webhook/route.ts](../../src/app/api/clickup/webhook/route.ts) | HMAC-SHA256 hex of the raw body, compared with `timingSafeEqual` |
| Slack Web API | `chat.postMessage`, `users.lookupByEmail` | [slack.ts](../../src/lib/slack.ts) | `SLACK_BOT_TOKEN` |
| Vercel AI Gateway → Gemini | `generateObject` (parse-request, temperature 0.2, zod schema) and `generateText` (nag lines) | [parse-request/route.ts](../../src/app/api/tasks/parse-request/route.ts), [nag-bot.ts](../../src/lib/nag-bot.ts) | Implicit gateway credentials |

## Key flows

1. **Paste a client message → tasks.** The user clicks **New Request** in `TasksTab` and pastes text into `NewRequestDialog`. The dialog calls POST `/api/tasks/parse-request`, where `requireProjectAccess` runs, input is truncated to 20k chars, `generateObject` returns up to 25 `{title, description, category, priority}`, and `sanitizeSuggestions` cleans them. The user edits the rows and saves: `requestsService.createRequest` → `tasksService.createTasksBatch` (a client `writeBatch`, each task stamped with `clickupSyncRequestId`) → `pushNewTasksToClickUp` (fire-and-forget) → `requestsService.markRequestParsed`.

2. **Local task → ClickUp (create).** `tasksService.createTask`/`createTasksBatch` → POST `/api/clickup/sync-create` → `syncCreatedTasksToClickUp`. The function reads `projects/{id}.clickupListId` (and skips if it is unset), plus the list statuses and team members. For each task:
   - A transaction claims `clickupSyncInFlightAt`. It skips if the task is already linked, has an empty title, belongs to another project, or has a lock younger than 2 min.
   - It re-reads the doc and calls `createClickUpTask` with the mapped status and the assignee id (if the email is a workspace member).
   - A second transaction writes `clickupTaskId/Url/SyncedAt` and `clickupLastSyncedRequestId`, and clears the lock. If a different `clickupTaskId` appeared in the meantime, it records a conflict error.
   - If `clickupSyncRequestId` changed during the create, it calls `syncTaskUpdateToClickUp(..., {forceFullState:true})`.
   - On error it stores `clickupSyncError` (500 chars max) and `clickupSyncFailedAt`, and clears the lock. The UI shows a retry button (`retryClickUpSync`).

3. **Local edit → ClickUp (update).** `tasksService.updateTask` writes the doc plus a new `clickupSyncRequestId`, then (if linked) POSTs `/api/clickup/sync-update` with `{patch, expectedRequestId}`. `syncTaskUpdateToClickUp` skips if the stored request id is already newer (`stale-request`). Otherwise `buildClickUpUpdateBody` maps the fields:
   - Assignee: it computes an add/rem diff against the live ClickUp assignees. An email that is not in the workspace fails with `email-not-in-workspace` and records a sync error.
   - It sends `updateClickUpTask` (PUT), then `finalizeSync` sets `clickupLastSyncedRequestId` in a transaction.
   - If a newer edit landed during the PUT, it loops with the full local state (max 3 attempts).

4. **Link a ClickUp list.** `ClickUpListLinkCard` → POST `/api/clickup/link-list`. `parseClickUpListId` runs, then a 409 check against other projects, then `fetchClickUpList` + `listTasksInList(listId, {subtasks:true})`. It writes `clickupListId/Name` to the project, loads existing mirrors with `clickupTaskId in` chunks of 30, and batches writes (commit every 400):
   - A task already mirrored in this project gets updated, and duplicates are deleted or unlinked.
   - A task mirrored in another project is skipped.
   - Any other task becomes a new doc with `source:'clickup'`, `category:'other'`, `createdBy: caller.email`.

   Afterwards, **Sync local** pushes the remaining unlinked local tasks through flow 2.

5. **ClickUp → local (webhook).** POST `/api/clickup/webhook`. It loads the secret; if there is none it acks 200 `no-secret`. It then verifies `X-Signature` (401 on mismatch). Inside a catch-all that always returns 200, `handleVerifiedEvent`:
   - Finds local docs with `clickupTaskId == task_id` and picks the canonical one.
   - `taskDeleted`: cleans up all mirrors. Disposable mirrors are deleted, manual-origin ones are unlinked.
   - Other `task*` events: it calls `fetchClickUpTask` (404 is treated as a delete).
   - If a local doc exists: when the task moved to a list other than the project's bound list, it cleans up. When a local edit is pending, it pushes local full state instead of overwriting. Otherwise it applies `clickUpTaskToUpdate` + `completedAt` + sync bookkeeping and dedupes the other mirrors.
   - If no local doc exists: if the task's list is bound to a project (`findProjectForList`), it creates a local task with `source:'clickup'` and `createdBy:'clickup-sync@system'`; otherwise it ignores the event.

6. **Webhook setup and self-heal.** An admin opens `/modules/clickup-settings` → **Register webhook** → POST `/api/clickup/register-webhook` with `{}`. The route resolves the team, deletes any webhook on the same endpoint, creates a new one, and stores the secret. Every 15 min, `ensureWebhookHealthy` in the refresh cron re-creates the webhook if ClickUp dropped it or marked it failing, which rotates the stored secret.

## Gotchas and invariants

- **The webhook must never 5xx.** ClickUp auto-disables a webhook after repeated failures. After signature verification, every internal error is logged and acked with 200 ([webhook/route.ts](../../src/app/api/clickup/webhook/route.ts) lines 118-127). Missing admin credentials or a missing secret are also acked 200 (lines 89-107). Only a bad signature returns 401 (lines 110-116). Keep this behaviour when editing the handler.
- **Rotating the secret is automatic.** Both register and the cron self-heal overwrite `webhookSecret`. Deliveries signed with the old secret in flight at that moment get a 401. The cron re-registers at the *stored* `endpoint`, so a wrong endpoint stays wrong until someone re-registers manually.
- **Webhook endpoint origin.** `originForRequest` uses `NEXT_PUBLIC_APP_URL || VERCEL_URL` before the request origin ([register-webhook/route.ts](../../src/app/api/clickup/register-webhook/route.ts) lines 27-33). The rest of the app standardised on `NEXT_PUBLIC_BASE_URL` / `getBaseUrl()`. `VERCEL_URL` is the per-deployment `*.vercel.app` host, which is behind deployment protection (it answers 302 to SSO, as seen in the daily-scan incident). If `NEXT_PUBLIC_APP_URL` is unset in production, the registered endpoint would be unreachable. Check the "Endpoint" field on the settings page after registering.
- **Signature verification** compares hex digests of the *raw* body ([clickup.ts](../../src/lib/clickup.ts) lines 403-417). Read the body with `request.text()` before any JSON parse. Re-serialising the body breaks the HMAC.
- **Duplicate mirrors are expected.** When sync-create creates a ClickUp task, ClickUp fires `taskCreated`. That webhook can arrive before the link-back transaction, find no local doc, and create a second `clickup-sync@system` mirror. The system tolerates this in three places: `chooseCanonicalClickUpDoc` on the server, `dedupeClickUpMirrors` in `subscribeToProjectTasks` on the client, and cleanup in the webhook, cron and link-list. Do not add a unique constraint that assumes one doc per `clickupTaskId` without handling this race.
- **"Disposable" means deleted, not unlinked.** `isDisposableClickUpMirror` is true for `source==='clickup'` **or** `createdBy==='clickup-sync@system'` ([clickup-local-mirrors.ts](../../src/lib/clickup-local-mirrors.ts) lines 93-95). When a ClickUp task is deleted or moved out of the bound list, those local docs are **hard-deleted**, and only other docs are unlinked. `/api/clickup/link` sets `source:'clickup'` on a task the user created manually ([link/route.ts](../../src/app/api/clickup/link/route.ts) line 97), so a manually created task that was later linked by URL is also deleted when its ClickUp task goes away.
- **Deleting a linked task locally does not delete it in ClickUp** (`tasksService.deleteTask`, [database.ts](../../src/services/database.ts) line 1691). If the ClickUp task is still in a bound list, the next webhook event for it finds no local doc and re-creates a mirror.
- **Request-id protocol.** `clickupSyncRequestId` (bumped on every pushable client edit) and `clickupLastSyncedRequestId` (set when a push or inbound sync completes) decide the winner. If they differ, a local edit has not reached ClickUp yet. In that case the webhook and cron push local full state instead of overwriting it with ClickUp data (webhook/route.ts lines 210-219; clickup-refresh/route.ts lines 217-229). Any writer that edits pushable fields without bumping `clickupSyncRequestId` gets overwritten by the next inbound sync. `updateRaycastTask` in [raycast-projects.ts](../../src/lib/raycast-projects.ts) (line 489) does exactly this and never pushes to ClickUp.
- **Create lock TTL is 2 minutes** on both sides: `SYNC_LOCK_TTL_MS` ([clickup-sync-create.ts](../../src/lib/clickup-sync-create.ts) line 21) and `CLICKUP_SYNC_LOCK_TTL_MS` ([clickupSyncState.ts](../../src/components/tasks/clickupSyncState.ts) line 3). Change them together.
- **Pushed fields are only** `title, description, status, priority, dueDate, assignee` (`CLICKUP_PUSHABLE_FIELDS`, [database.ts](../../src/services/database.ts) line 1456). Tags are only sent on create and are only mirrored inbound after that. Category, source, order, billing and request link are local-only. Inbound sync overwrites `tags` and `parentClickupTaskId` as well.
- **Status mapping is heuristic and lossy.** Inbound, `mapClickUpStatus` treats type `closed`/`done` as done, then matches substrings ("progress", "review"/"qa"/"qc", "block", "backlog"), and anything else becomes `todo` ([clickup.ts](../../src/lib/clickup.ts) lines 213-223). Outbound, `taskStatusToClickUpStatus` picks a matching status on the list. If none matches, the status is left out of the push (lines 260-291), so ClickUp keeps its old status while the app shows the new one until the next inbound sync reverts it.
- **ClickUp "normal" priority maps to local `medium`**, and `medium` maps back to 3 (normal).
- **Due dates** are written as UTC noon epoch ms with `due_date_time:false` to avoid day flips (`isoDateToClickUpMs`, clickup.ts lines 327-335). Inbound uses `toISOString().slice(0,10)` (UTC).
- **Single assignee locally.** Inbound picks the first `@activeset.co` assignee, else the first assignee (`pickAssigneeEmail`, clickup.ts lines 303-307). Outbound replaces all ClickUp assignees with that one.
- **The list import skips closed tasks**: `listTasksInList(listId, { subtasks: true })` without `includeClosed` ([link-list/route.ts](../../src/app/api/clickup/link-list/route.ts) line 102).
- **One list ↔ one project.** Both link-list (lines 83-96) and link (lines 76-87) return 409 when the list or task is already bound elsewhere. Unbinding a list keeps per-task links: those tasks keep syncing, but new ClickUp tasks in that list are no longer imported.
- **The refresh cron only sees 200 linked tasks per run** (`MAX_REFRESHED_PER_RUN`, [clickup-refresh/route.ts](../../src/app/api/cron/clickup-refresh/route.ts) lines 37 and 168-172). The query has no cursor or ordering, so it is effectively the same first 200 docs every run. Beyond 200 linked tasks, the rest only update through webhooks.
- **Nag-bot must never ping clients.** `isTeamMember` filters every assignee ([nag-bot.ts](../../src/lib/nag-bot.ts) lines 422 and 483; [team.ts](../../src/lib/team.ts)). Dormant projects (`closed|paid|paused`) are skipped, while projects with no status are treated as live (line 165). Checklist steps without a due date are intentionally ignored, so a ~70-step SOP does not flood Slack.
- **The nag cron is in UTC** (`0 14,19 * * 1-5`). The settings page copy says "10:00 and 15:00 ET", which only holds during EDT.
- **Firestore reads are public** for `tasks` and `requests` (read `if true`), so any client can list every task in every project. This is kept deliberately for the share page ([firestore.rules](../../firestore.rules) lines 174-181).
- **The ClickUp settings page gate is client-side only** (`isAdmin` from `useAuth`). The real protection is `requireAdmin` in register-webhook and test-nag.

## Tests

- No unit tests cover `clickup*.ts`, `nag-bot.ts`, `task-billing.ts`, the ClickUp routes or the task components.
- [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) checks public-read / team-write for `tasks` and `requests`. Run it with `npm run test:rules` (Firestore emulator).
- `npm test` (`test:lib` + domain/alt-text/worker/site-monitoring/local-capture) does not exercise this module.

## Related docs

- [docs/features/tasks-clickup.md](../features/tasks-clickup.md): **partially stale.** Correct about the list/task bindings, `Sync local`, per-task Create/link, the 2-minute `clickupSyncInFlightAt` lock, error fields, and local-only category/source/order. Stale or incomplete:
  - It says a task moved out of the linked list "is kept but unlinked". In fact imported mirrors and `source:'clickup'` tasks (including ones linked by URL) are **deleted**, and only manual-origin tasks are kept and unlinked.
  - It says assignee syncs "when the email maps", but an unmapped email records a sync error rather than being silently skipped.
  - It lists tags nowhere. Tags are pushed on create and otherwise mirrored inbound only.
  - It leaves out the request-id protocol, the refresh cron, webhook self-heal, subtasks, dedupe, AI request parsing and the nag-bot.
- [docs/features/project-links.md](../features/project-links.md): owner of the project detail screen that hosts the Tasks tab. Not verified here.
- [docs/features/client-portal.md](../features/client-portal.md): the client portal reads `tasks` via [client-portal.ts](../../src/lib/client-portal.ts). Not verified here.
