---
module: client-portal
title: Client Portal
keywords: [client portal, client dashboard, client plan, clientPlan, stages, stage, what you get, tracker, live tracker, current stage, currentStageId, files, stage files, plan files, new project dialog, portal link, project page, client tab, Client, share link, capability token, portal token, rotate, disable, enable portal, preview as client, client status, clientFacing, clientPortal, client_portal_tokens, portal_views, view beacon, opened, stale portal, Client updates due, Waiting on client, Waiting on you, needs_client, needs client input, asks, What we need from you, visible to client, clientVisible, deliverables, approval, approve, sign off, client_review, delivery.approvals, branding, welcome line, CLIENT_PORTAL_TOKEN_KEY, allow-list, projection, buildClientPortalView, daily review, review digest]
entry_points: [/portal/[token], /modules/project-links/[id]?tab=client, /modules/project-links]
code_roots: [src/modules/client-portal, src/app/portal/[token], src/app/api/portal/[token], src/app/api/client-portal/[projectId], src/lib/client-portal.ts, src/lib/client-portal-tokens.ts, src/lib/client-portal-auth.ts]
last_verified: 2026-09-23 @ a00f91e
---
# Client Portal

> The client dashboard: a private, sign-in-free, read-mostly page per project (`/portal/<token>`) that the agency sends to a client. It answers three questions: where the project is (status, the current stage with a live progress bar, the team's one-line note, that stage's files), what the client gets and when (every stage of the **client plan** with its dates, "what you get" lines and files), and what we need from them (open asks). Project-wide files, and one Approve button when a checklist stage carries the `client_review` role (the only write a client can make), sit below. The plan (`projects/{id}.clientPlan`) is drafted from the project's own checklist when the project is created (New project dialog, owned by [project-links.md](./project-links.md)) or from the Client tab, and its progress is read back off that checklist, so ticking steps in the Delivery tab moves the client's tracker; the team can pin the stage by hand. The team runs it all from the **Client** tab (link, Now, Plan) and sees client-facing signals on the project dashboard (status chip, "shared / waiting on client / stale" counts, a "Waiting on client" filter, a "Client updates due" banner). The token in the URL is the only credential. Everything the client receives is built server-side by one allow-list projection, `buildClientPortalView`.

## Where to find things (quick lookup)

| I want to… | Go to |
| --- | --- |
| Change what the client can see (add/remove a field) | [client-portal.projection.ts](../../src/modules/client-portal/domain/client-portal.projection.ts) `buildClientPortalView` + `CLIENT_PORTAL_VIEW_KEYS` in [client-portal.types.ts](../../src/modules/client-portal/domain/client-portal.types.ts); update the test |
| Change how checklist sections map to client stages, stage defaults (names, lengths, "what you get" wording), plan drafting or how the current stage is decided | [client-plan.ts](../../src/modules/client-portal/domain/client-plan.ts) `kindOfSection`, `classifySections`, `CLIENT_STAGE_DEFAULTS`, `draftClientPlan`, `resolveClientPlan`; tests in [client-plan.test.ts](../../src/modules/client-portal/domain/client-plan.test.ts) |
| Change how a stored plan is cleaned (URL rules, limits) | [client-plan.ts](../../src/modules/client-portal/domain/client-plan.ts) `normalizeClientPlan`, `safeHttpUrl` |
| Change what an old, pre-plan portal keeps showing | [client-plan.ts](../../src/modules/client-portal/domain/client-plan.ts) `legacyClientPlan` |
| Change how tokens are minted/rotated/revoked | [client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) `issuePortalToken`, `revokePortalTokens` |
| Change how a link is verified | [client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) `verifyPortalToken` |
| Change what the portal page loads from Firestore | [client-portal.ts](../../src/lib/client-portal.ts) `loadClientPortalByToken` |
| Change the portal page layout | [ClientPortalScreen.tsx](../../src/modules/client-portal/ui/screens/ClientPortalScreen.tsx); "Where we are" [PortalNowCard.tsx](../../src/modules/client-portal/ui/components/PortalNowCard.tsx), "What you get, and when" [PortalStages.tsx](../../src/modules/client-portal/ui/components/PortalStages.tsx), "Files & links" [PortalFiles.tsx](../../src/modules/client-portal/ui/components/PortalFiles.tsx) (rows: [PortalFileList.tsx](../../src/modules/client-portal/ui/components/PortalFileList.tsx)) |
| Change the "no longer active" / "temporarily unavailable" notices | [page.tsx](../../src/app/portal/[token]/page.tsx) `PortalNotice`, `UnavailableNotice` |
| Change view counting / bot filtering | [view/route.ts](../../src/app/api/portal/[token]/view/route.ts) `BOT_UA_PATTERN`; client side [TrackPortalView.tsx](../../src/modules/client-portal/ui/components/TrackPortalView.tsx) |
| Change the client approval write | [approve/route.ts](../../src/app/api/portal/[token]/approve/route.ts); card UI [PortalReview.tsx](../../src/modules/client-portal/ui/components/PortalReview.tsx) |
| See the team-side approval record | [ClientApprovalCard.tsx](../../src/modules/delivery/ui/components/ClientApprovalCard.tsx) (delivery module) |
| Change the Client tab | [ClientPanel.tsx](../../src/modules/client-portal/ui/screens/ClientPanel.tsx); mounted in [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) |
| Change the link card (Enable / Copy / Preview / Rotate / Disable / "Opened N×") | [PortalLinkCard.tsx](../../src/modules/client-portal/ui/components/PortalLinkCard.tsx) |
| Change the Now card (stage the client sees, "Move to …", status, note) | [ClientNowEditor.tsx](../../src/modules/client-portal/ui/components/ClientNowEditor.tsx) |
| Change the plan editor (stages, dates, what you get, files, add/move/remove, rebuild) | [ClientPlanEditor.tsx](../../src/modules/client-portal/ui/components/ClientPlanEditor.tsx), [PlanStageRow.tsx](../../src/modules/client-portal/ui/components/PlanStageRow.tsx), [PlanFilesEditor.tsx](../../src/modules/client-portal/ui/components/PlanFilesEditor.tsx); first plan / rebuild [ClientPlanSetup.tsx](../../src/modules/client-portal/ui/components/ClientPlanSetup.tsx) |
| Change plan writes | `clientPortalRepository` `editPlan` / `savePlan` / `updateStage` / `addStage` / `removeStage` / `moveStage` / `setPlanFiles` ([client-portal.repository.ts](../../src/modules/client-portal/infrastructure/client-portal.repository.ts)) → `projectsService.updateClientPlan` ([database.ts](../../src/services/database.ts), a transaction) |
| Change branding fields | [PortalBrandingFields.tsx](../../src/modules/client-portal/ui/components/PortalBrandingFields.tsx) → `projectsService.updateClientPortalSettings` |
| Change the stale threshold (7 days) | [client-status.ts](../../src/modules/client-portal/domain/client-status.ts) `PORTAL_STALE_AFTER_DAYS`, `isPortalStale` |
| Change client status values/labels | [src/types/index.ts](../../src/types/index.ts) `ClientStatus`, `CLIENT_STATUS_LABELS` (internal), `CLIENT_STATUS_PORTAL_LABELS` (client wording) |
| Change the dashboard chip | [ClientStatusChip.tsx](../../src/modules/client-portal/ui/components/ClientStatusChip.tsx) (used by [ProjectCard.tsx](../../src/components/projects/ProjectCard.tsx)) |
| Change the "Client updates due" banner | [ClientUpdatesBanner.tsx](../../src/components/projects/ClientUpdatesBanner.tsx) |
| Change the header "Share" button / `s` / `c` shortcuts | `handleShareClientLink` in [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx); [ProjectShortcuts.tsx](../../src/modules/project-links/ui/components/ProjectShortcuts.tsx) |
| Change the portal URL origin | [base-url.ts](../../src/lib/base-url.ts) `getBaseUrl`, `portalUrl` |
| Change portal response headers (no-referrer, noindex) | [next.config.ts](../../next.config.ts) `headers()` |
| Toggle "Needs client input" on a task | [TaskTable.tsx](../../src/components/tasks/TaskTable.tsx) actions column |

## User-facing pages

| URL | File | What it shows | Access |
| --- | --- | --- | --- |
| `/portal/[token]` | [src/app/portal/[token]/page.tsx](../../src/app/portal/[token]/page.tsx) → [ClientPortalScreen.tsx](../../src/modules/client-portal/ui/screens/ClientPortalScreen.tsx) | Light-theme (`.portal-theme`), max ~760px page: header (brand logo/name, project name, welcome); "Where we are" (status chip, "Updated …", "Stage n of N", current stage name and %, one segment per stage, its dates, "Up next", the team's note, "Files for this stage"; "Every stage is done" once finished); "What we need from you" asks (only when any); "What you get, and when" (every stage: Done / Now · % / Coming up, dates, what you get, files); "Files & links" (the Webflow custom domain as "Your website", plus project-wide files; only when any); review/approval card (only when a `client_review` stage exists); footer (agency contact mailto, "private to …"). `?preview=1` shows a preview banner, suppresses the beacon and disables Approve. | Anyone holding a valid token. No login. `force-dynamic`, `revalidate = 0`, robots `noindex,nofollow,nocache`. |
| `/modules/project-links/[id]` → **Client** tab (`?tab=client`, keyboard `3`, since it is the 3rd tab after Audit and Delivery) | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) → [ClientPanel.tsx](../../src/modules/client-portal/ui/screens/ClientPanel.tsx) (loaded with `next/dynamic`, `ssr: false`) | "Link to send" (the portal link card), "Now" (stage the client sees: follow the checklist or pin one, "Move to <next>", status, one-line note, Mark updated), "Plan: what they get, and when" (every stage with dates, what you get and files, inline edit, add/move/remove, rebuild from the checklist, project-wide files; empty → create from the checklist or the standard stages; an old portal's content → "Keep these stages"), "What we need from them" (read-only published asks), "Page header" (brand name, welcome, client contacts). Tab stat shows internal client-status label or "Off". | Signed-in team (project access). |
| `/modules/project-links` (dashboard) | [ProjectLinksDashboardScreen.tsx](../../src/modules/project-links/ui/screens/ProjectLinksDashboardScreen.tsx) | `ClientStatusChip` on each card, header counts `N shared · N waiting on client · N stale`, status filter "Waiting on client" (`needs_client`), per-client-group waiting/stale rollups, `ClientUpdatesBanner`. Card menu can set client status (no freshness touch). | Signed-in team. |

## API routes

| Method | Path | File | Auth | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/client-portal/[projectId]/link` | [link/route.ts](../../src/app/api/client-portal/[projectId]/link/route.ts) | Firebase ID token (`requireProjectAccess`) | Current link state `{ enabled, url, retrievable, issuedAt, lastUsedAt, useCount }`. `url` only if `CLIENT_PORTAL_TOKEN_KEY` can decrypt the stored ciphertext. 503 without firebase-admin. |
| POST | `/api/client-portal/[projectId]/link` | same | Firebase ID token (`requireProjectAccess`) | Body `{ action: 'enable' \| 'rotate' \| 'disable' }`. `enable` reuses the live token only if the portal is already enabled and a pointer-resolved active token exists; otherwise issues fresh. `rotate` always issues. `disable` revokes all + sets `enabled: false`. Response always includes `url` after issue (show-once). |
| GET | `/api/client-portal/[projectId]/views?limit=N` | [views/route.ts](../../src/app/api/client-portal/[projectId]/views/route.ts) | Firebase ID token (`requireProjectAccess`) | Newest portal opens from `projects/{id}/portal_views` (default 20, max 100; the Client tab requests 50 via `listViews`, ViewsPopover passes its own). Same shape as proposal views. |
| POST | `/api/portal/[token]/view` | [view/route.ts](../../src/app/api/portal/[token]/view/route.ts) | Portal token (`requirePortalToken`) | View beacon. Skips `{preview:true}` bodies and bot UAs; otherwise adds a `portal_views` row, merges `clientFacing.viewCount/lastViewedAt/lastViewCountry/lastViewCity`, and stamps the token's `lastUsedAt`/`useCount`. |
| POST | `/api/portal/[token]/approve` | [approve/route.ts](../../src/app/api/portal/[token]/approve/route.ts) | Portal token (`requirePortalToken`) | Body `{ stageKey: "<checklistId>:<sectionId>", note? }` (note trimmed, max 2000). Verifies the checklist belongs to the token's project and the section's role is `client_review`; appends to `projects/{id}.delivery.approvals` in a transaction; idempotent (returns the first approval). |
| GET | `/api/cron/review-digest` | [review-digest/route.ts](../../src/app/api/cron/review-digest/route.ts) | Cron secret (`isCronAuthorized`) | Team-internal daily review digest email (not client-facing; see "Adjacent: daily review"). |

There is no messages/replies route any more; client messaging was removed (commits `2c577e9`, `1668777`).

## Code map

### Module `src/modules/client-portal/`

| File | Responsibility |
| --- | --- |
| [index.ts](../../src/modules/client-portal/index.ts) | Barrel. Exports domain (`buildClientPortalView`, labels, the plan functions `draftClientPlan` / `resolveClientPlan` / `normalizeClientPlan` / `legacyClientPlan` / `planStageKinds` / `newPlanId` / `safeHttpUrl`, `CLIENT_STAGE_DEFAULTS`, `CLIENT_STAGE_KINDS`, `STANDARD_STAGE_KINDS`, `PLAN_COMPLETE`, `isPortalStale`, `daysSinceClientUpdate`, `ageLabel`, `PORTAL_STALE_AFTER_DAYS`, `CLIENT_STATUS_ORDER`), `clientPortalRepository`, `ClientPortalScreen`, `ClientPanel`, `ClientStatusChip`. The New project dialog (project-links) uses `draftClientPlan` through it. **Must not be imported by `src/app/portal/**`** (see Gotchas). |
| [domain/client-portal.types.ts](../../src/modules/client-portal/domain/client-portal.types.ts) | `ClientPortalView` (the only payload the page gets), `PortalStageView`, `PortalStageState` + `PORTAL_STAGE_LABELS` (Done / Now / Coming up), `PortalFileView`, `PortalAskView`, `PortalReviewView`, `CLIENT_PORTAL_VIEW_KEYS`. Re-exports client status and plan types from `@/types`. |
| [domain/client-plan.ts](../../src/modules/client-portal/domain/client-plan.ts) | The client plan, pure. `kindOfSection` (title patterns, most specific first, then the section role), `classifySections` (walks sections in order: silent titles join the stage before, never walks backwards, a review with a build still ahead belongs to the stage it reviews), `checklistSections` (oldest checklist first), `planStageKinds`, `draftClientPlan` + `spreadStageDates` (back-to-back dates from the start, scaled to a target end date), `CLIENT_STAGE_DEFAULTS` (name, default days, starting "what you get" per kind), `normalizeClientPlan` + `safeHttpUrl` (http(s) only, no `undefined`, limits), `resolveClientPlan` (per-stage tracking from the checklist, current stage: Delivered → all done, `PLAN_COMPLETE` → all done, a pinned stage, else the earliest unfinished stage), `legacyClientPlan` (an old portal's timeline and link switches as a plan), `latestChecklistChange`. |
| [domain/client-portal.projection.ts](../../src/modules/client-portal/domain/client-portal.projection.ts) | `buildClientPortalView({ project, timeline, tasks, checklists, now })` — the allow-list. Uses the saved `clientPlan`, else `legacyClientPlan`; resolves it against the checklists. Also `detectWebsiteUrl`, `toPortalReview`, `reviewRoleOf` (duplicate of delivery's `roleOf`). |
| [domain/client-status.ts](../../src/modules/client-portal/domain/client-status.ts) | `PORTAL_STALE_AFTER_DAYS = 7`, `CLIENT_STATUS_ORDER`, `daysSinceClientUpdate` (viewer-local calendar days), `isPortalStale`, `ageLabel`. |
| [domain/client-portal.projection.test.ts](../../src/modules/client-portal/domain/client-portal.projection.test.ts) | 17 `node:test` cases: key allow-list (view and stage), sentinel non-leakage (checklist steps, plan editor emails, `kind`), tracker following the checklist, pin and Delivered, http(s)-only files, last-update dating, old-portal fallback and its end once a plan is saved, asks, branding overrides, review selection. |
| [domain/client-plan.test.ts](../../src/modules/client-portal/domain/client-plan.test.ts) | 22 `node:test` cases run against the real built-in SOPs: section-to-stage mapping (Webflow migration → 7 stages, brand → 4), mid-project reviews, drafting and dates, current-stage rules, cleaning, the old-portal conversion. |
| [infrastructure/client-portal.repository.ts](../../src/modules/client-portal/infrastructure/client-portal.repository.ts) | `'use client'`. `clientPortalRepository`: `getLinkState`, `setLink`, `listViews` (via `fetchAuthed` to the team routes); pass-throughs to `projectsService.updateClientFacing` (status, note, `currentStageId`), `markClientUpdated`, `updateClientPortalSettings`; plan edits `editPlan` (every edit runs `normalizeClientPlan` on the way in), `savePlan`, `updateStage`, `addStage`, `removeStage`, `moveStage`, `setPlanFiles`. Types `PortalLinkState`, `PortalViewRow`, `PortalLinkAction`. |
| [ui/screens/ClientPortalScreen.tsx](../../src/modules/client-portal/ui/screens/ClientPortalScreen.tsx) | Server component composing the portal page. Only `PortalReview` and `TrackPortalView` are client components on this page. |
| [ui/screens/ClientPanel.tsx](../../src/modules/client-portal/ui/screens/ClientPanel.tsx) | Team Client tab: Link to send, Now, Plan, What we need from them, Page header. Resolves the plan (saved, else the old portal's) against the `checklists` prop the project screen passes. Also contains local `PublishedAsks` (read-only list of open `needsClientInput` tasks, links to `?tab=tasks`). `isAdmin` prop is accepted but unused. |
| ui/components (portal side) | [PortalHeader](../../src/modules/client-portal/ui/components/PortalHeader.tsx), [PortalNowCard](../../src/modules/client-portal/ui/components/PortalNowCard.tsx) (with the per-stage `StageTrack`), [PortalStatusChip](../../src/modules/client-portal/ui/components/PortalStatusChip.tsx), [PortalStages](../../src/modules/client-portal/ui/components/PortalStages.tsx), [PortalFiles](../../src/modules/client-portal/ui/components/PortalFiles.tsx), [PortalFileList](../../src/modules/client-portal/ui/components/PortalFileList.tsx) (icon by host: Figma, Drive, Docs/Notion, Loom/YouTube/Vimeo, staging hosts), [PortalAsks](../../src/modules/client-portal/ui/components/PortalAsks.tsx), [PortalReview](../../src/modules/client-portal/ui/components/PortalReview.tsx) (client; Approve), [PortalFooter](../../src/modules/client-portal/ui/components/PortalFooter.tsx), [PortalSectionHeading](../../src/modules/client-portal/ui/components/PortalSectionHeading.tsx), [ActiveSetWordmark](../../src/modules/client-portal/ui/components/ActiveSetWordmark.tsx), [TrackPortalView](../../src/modules/client-portal/ui/components/TrackPortalView.tsx) (client; beacon), [portal-format.ts](../../src/modules/client-portal/ui/components/portal-format.ts) (`formatDay`, `formatDateRange`, `formatStageDates`, `formatRelativeDay`, `hostnameOf`, `brandInitial`). |
| ui/components (team side) | [PortalLinkCard](../../src/modules/client-portal/ui/components/PortalLinkCard.tsx), [ClientNowEditor](../../src/modules/client-portal/ui/components/ClientNowEditor.tsx) (stage select: follow the checklist / a stage / every stage done; "Move to <next>" saves at once and is disabled while the form has unsaved changes; Save = `touch: true`; "Mark updated"; note max 160), [ClientPlanEditor](../../src/modules/client-portal/ui/components/ClientPlanEditor.tsx), [PlanStageRow](../../src/modules/client-portal/ui/components/PlanStageRow.tsx) (read view + inline form: name, starts, due, what you get one per line), [PlanFilesEditor](../../src/modules/client-portal/ui/components/PlanFilesEditor.tsx) (link + optional name, saves on add/remove, refuses non-web links), [ClientPlanSetup](../../src/modules/client-portal/ui/components/ClientPlanSetup.tsx) (first plan, or rebuild keeping names, what-you-get lines and files of stages whose kind survives), [PortalBrandingFields](../../src/modules/client-portal/ui/components/PortalBrandingFields.tsx) (brand name, welcome, client contacts), [ClientStatusChip](../../src/modules/client-portal/ui/components/ClientStatusChip.tsx) (renders nothing unless enabled), [copy-text.ts](../../src/modules/client-portal/ui/components/copy-text.ts). |

### App routes

| File | Responsibility |
| --- | --- |
| [src/app/portal/[token]/page.tsx](../../src/app/portal/[token]/page.tsx) | Server page + `generateMetadata` (title `"<brand> · <project>"`), React `cache`-deduped loader, notice states. |
| [src/app/api/portal/[token]/view/route.ts](../../src/app/api/portal/[token]/view/route.ts) | Beacon (above). |
| [src/app/api/portal/[token]/approve/route.ts](../../src/app/api/portal/[token]/approve/route.ts) | Client approval (above). |
| [src/app/api/client-portal/[projectId]/link/route.ts](../../src/app/api/client-portal/[projectId]/link/route.ts) | Team link management. |
| [src/app/api/client-portal/[projectId]/views/route.ts](../../src/app/api/client-portal/[projectId]/views/route.ts) | Team views list. |

### Components outside the module

| File | Responsibility |
| --- | --- |
| [src/components/projects/ClientUpdatesBanner.tsx](../../src/components/projects/ClientUpdatesBanner.tsx) | "Client updates due" banner: enabled portals with no `lastUpdateAt` or older than 7 days, never-updated first, names up to 3. Belongs here. |
| [src/components/projects/ProjectCard.tsx](../../src/components/projects/ProjectCard.tsx) | Renders `ClientStatusChip`; `handleSetClientStatus` calls `updateClientFacing` **without** `touch`. (Owned by project-links.) |
| [src/components/views/ViewsPopover.tsx](../../src/components/views/ViewsPopover.tsx) | Shared views popover (proposals + portal). |
| [src/components/projects/DailyReviewBanner.tsx](../../src/components/projects/DailyReviewBanner.tsx), [ProjectReviewToggle.tsx](../../src/components/projects/ProjectReviewToggle.tsx) | **Not client portal** — team "daily review" feature. See "Adjacent: daily review". |

### Services / lib

| File | Responsibility |
| --- | --- |
| [src/lib/client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) | `server-only`. `ClientPortalTokenRecord`, `hashPortalToken`, `isWellFormedPortalToken` (`/^[A-Za-z0-9_-]{43}$/`), AES-256-GCM `encryptToken`/`decryptToken`, `canRetrievePortalTokens`, `issuePortalToken`, `revokePortalTokens`, `getActivePortalToken`, `verifyPortalToken`, `touchPortalToken`, `PortalAuthError`. |
| [src/lib/client-portal-auth.ts](../../src/lib/client-portal-auth.ts) | `server-only`. `requirePortalToken` (wraps verify), `portalAuthErrorResponse`. Deliberately separate from `api-auth.ts` so a token never becomes an `AuthedCaller`. |
| [src/lib/client-portal.ts](../../src/lib/client-portal.ts) | `server-only`. `loadClientPortalByToken`: verify → read timeline (only used for a pre-plan portal), `needsClientInput` tasks (limit 500), checklists (limit 20, the tracker's source) with firebase-admin → `buildClientPortalView`. Returns `null` for 404-class rejections, rethrows infra errors. |
| [src/lib/base-url.ts](../../src/lib/base-url.ts) | `getBaseUrl`, `portalPath`, `portalUrl`. |
| [src/services/database.ts](../../src/services/database.ts) `projectsService` | Client-SDK writes: `updateClientFacing(projectId, patch, byEmail, { touch })` (status, statusNote, `currentStageId`), `markClientUpdated`, `updateClientPortalSettings` (brandName, brandLogoUrl, welcome, contactEmails; never `enabled`), `updateClientPlan(projectId, mutate, byEmail)` (transaction; stamps `clientPlan.updatedAt/By` and `clientFacing.lastUpdateAt/By`). All four have localhost-bypass branches. `createProject(userId, name, setup)` takes the New project dialog's fields, `clientPlan` included (owned by project-links). |
| [src/lib/constants.ts](../../src/lib/constants.ts) | `COLLECTIONS.CLIENT_PORTAL_TOKENS = 'client_portal_tokens'`, `COLLECTIONS.CLIENT_PORTAL_VIEWS = 'portal_views'`. |
| [src/lib/ui-tones.ts](../../src/lib/ui-tones.ts) | `CLIENT_STATUS_TONES` for chips/editor. |
| [src/lib/review-status.ts](../../src/lib/review-status.ts) | `todayIso`, `daysBetweenIso` (used by client-status for day math) plus daily-review helpers. |

### Types (`src/types/index.ts`)

`ClientStatus`, `CLIENT_STATUSES`, `CLIENT_STATUS_LABELS`, `CLIENT_STATUS_PORTAL_LABELS`, `normalizeClientStatus` (unknown → `on_track`), `ClientPortalSettings`, `ClientFacingState` (incl. `currentStageId`; `currentPhaseId` deprecated), `ClientPlan`, `ClientPlanStage`, `ClientPlanFile`, `ClientStageKind`, `StageApproval`, `StageRole`, `Project.clientPortal`, `Project.clientFacing`, `Project.clientPlan`, `Project.delivery.approvals`, `Task.needsClientInput`. `ProjectLink.clientVisible` and `TimelineMilestone.clientVisible` are now read only for a pre-plan portal; no UI sets them any more.

## Data model

| Path | One document = | Key fields (type, file) | Written by | Read by | SDK |
| --- | --- | --- | --- | --- | --- |
| `projects/{id}.clientPortal` | map on the project | `ClientPortalSettings` ([types](../../src/types/index.ts)): `enabled`, `activeTokenHash`, `tokenIssuedAt` (server, in token transactions); `brandName`, `brandLogoUrl`, `welcome`, `contactEmails` (team) | `issuePortalToken`/`revokePortalTokens` (admin); `updateClientPortalSettings` (client SDK) | verify, projection, dashboard, Client tab | both |
| `projects/{id}.clientPlan` | map on the project: the client dashboard's plan | `ClientPlan` ([types](../../src/types/index.ts)): `stages[]` (`id`, `title`, `kind?` — ties the stage to checklist sections, `deliverables[]`, `startDate?`, `dueDate?`, `files[]` of `{id,title,url}`), `files[]` (project-wide), `templateId?`, `updatedAt`, `updatedBy` | New project dialog (inside `createProject`), Client tab via `updateClientPlan` (client SDK, transaction, always normalised) | projection, Client tab | client write, admin read |
| `projects/{id}.clientFacing` | map on the project | `ClientFacingState`: `status`, `statusNote`, `currentStageId` (`'__complete__'` = every stage done; unset = follow the checklist), deprecated `currentPhaseId`, `lastUpdateAt`, `lastUpdateBy` (team); `viewCount`, `lastViewedAt`, `lastViewCountry`, `lastViewCity` (beacon); `openRequestCount` (declared, never written) | team via `updateClientFacing`/`markClientUpdated` (bump `updatedAt`); beacon via admin merge (no `updatedAt`) | projection, chip, banner, dashboard | both |
| `projects/{id}.delivery.approvals[]` | one client sign-off | `StageApproval`: `stageKey` (`checklistId:sectionId`), `stageTitle`, `approvedAt`, `note?` | approve route (admin, transaction, merge, no `updatedAt`) | projection (`review`), `ClientApprovalCard` | admin write |
| `projects/{id}.links[].clientVisible` | flag on a manual link (legacy) | `ProjectLink.clientVisible` | nothing any more | `legacyClientPlan` (files, "Open site") until a plan is saved | client |
| `project_timelines/{projectId}` `.phases[]`, `.milestones[].clientVisible` | the team's internal timeline | `ProjectTimeline`, `TimelineMilestone` | Timeline tab (client SDK; `clientVisible` preserved, no longer editable) | loader (admin), only for a pre-plan portal | both |
| `tasks` where `projectId`, `needsClientInput == true` | a task; open ones become asks (title + dueDate only) | `Task.needsClientInput`, `status`, `dueDate`, `order` | Tasks tab (client SDK) | loader (admin, limit 500), `PublishedAsks` | both |
| `project_checklists` where `projectId` | checklist; drives the tracker (item statuses per section, classified into stage kinds) and, for sections with role `client_review` (or legacy `stage`), the review card | `ProjectChecklist`, `ChecklistSection.role` | checklist/delivery UI; created by the New project dialog | loader (limit 20), approve route, Client tab | admin read |
| `client_portal_tokens/{sha256(token)}` | one issued token | `ClientPortalTokenRecord` ([client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts)): `projectId`, `active`, `createdBy`, `createdAt`, `expiresAt?`, `revokedAt?`, `revokedBy?`, `lastUsedAt?`, `useCount`, `tokenCiphertext?` (base64 iv‖tag‖ct), reserved `clientId?`, `label?` | firebase-admin only | firebase-admin only | admin |
| `projects/{id}/portal_views/{auto}` | one counted open | `{ projectId, tokenHash, viewedAt (ISO), ipHash? (16 hex), userAgent? (≤512), referrer? (≤512), country?, city? }` (untyped, built in view route) | beacon (admin) | views route (admin) | admin |

Rules and indexes:
- [firestore.rules](../../firestore.rules) lists neither `client_portal_tokens` nor `portal_views`; both are deny-by-default for client SDKs (comment at lines ~24-28 and ~146-148). `projects/{id}` is readable/updatable by any `@activeset.co` user (lines ~71-106) with no field-level protection — so `clientPortal.enabled`, `activeTokenHash` and `delivery.approvals` are technically writable by team client SDKs (the type comment claiming rules prevent it is wrong; the server's pointer+record checks are what make links safe).
- `project_timelines`, `project_checklists`, `tasks`, `requests` are `allow read: if true` (public read, team write).
- [firestore.indexes.json](../../firestore.indexes.json) has no portal entries. `portal_views` uses a single-field `orderBy('viewedAt')` in a subcollection (no composite needed). The token queries (`projectId == X && active == true`) and the asks query (`projectId == X && needsClientInput == true`) are equality-only and served by single-field index merging.
- No Storage use.

## Background jobs

| Job | Schedule | Route | What | Auth |
| --- | --- | --- | --- | --- |
| Review digest | `0 22 * * 1-5` ([vercel.json](../../vercel.json)) | `GET /api/cron/review-digest` | `runReviewDigest` ([review-digest.ts](../../src/lib/review-digest.ts)): emails the team a list of current, tagged projects not marked reviewed today. **Team-internal, unrelated to the portal.** | `CRON_SECRET` via `isCronAuthorized` ([cron-auth.ts](../../src/lib/cron-auth.ts)); fail-closed in production |

No portal-specific cron, worker job, queue or webhook exists. There is no client digest email (Phase 3, not built).

## Configuration

| Env var | Required | Used where |
| --- | --- | --- |
| Firebase admin credentials (see firebase-admin lib) | Yes | Without them: page shows "temporarily unavailable"; link/views/view/approve routes return 503. `hasFirebaseAdminCredentials` from [firebase-admin.ts](../../src/lib/firebase-admin.ts). |
| `CLIENT_PORTAL_TOKEN_KEY` | Optional | [client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) reads it as `process.env[KEY_ENV]` (grep for the literal name, not `process.env.CLIENT_PORTAL_TOKEN_KEY`). 32 bytes as 64 hex chars or base64. Set → links re-showable (`retrievable: true`); unset or wrong length → show-once, logged error on bad length. Must be the same value across every environment sharing the Firebase project. |
| `NEXT_PUBLIC_BASE_URL` / `APP_BASE_URL` | Optional | [base-url.ts](../../src/lib/base-url.ts): pins portal URL origin. Else `VERCEL_ENV=production` → `https://app.activeset.co`, `VERCEL_URL` → preview URL, else `http://localhost:3000`. |
| `PROPOSAL_VIEW_IP_SALT` | Optional | view route IP hash salt; fallback `'client-portal-view-ip-salt'`. |
| `CRON_SECRET` | Yes in prod | review-digest cron. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `REVIEW_DIGEST_EMAIL` or `NOTIFY_EMAIL`, `REVIEW_TIMEZONE` (default `America/New_York`), `NEXT_PUBLIC_APP_URL` | For the digest | [review-digest.ts](../../src/lib/review-digest.ts). |

No feature flags. Constants: `PORTAL_STALE_AFTER_DAYS = 7`, note max 160 chars (editor), approval note max 2000, views limit default 20 / max 100.

## External services

- **Vercel edge headers** `x-vercel-ip-country`, `x-vercel-ip-city`, `x-forwarded-for` read by the beacon for geo and IP hash — no API call.
- **Gmail SMTP via nodemailer** — only for the (non-portal) review digest.
- No other third party. The portal does not email or Slack anyone.

## Key flows

1. **Enable and share a link**
   1. Team clicks *Enable portal* in `PortalLinkCard` → `clientPortalRepository.setLink(id, 'enable')` → `POST /api/client-portal/[id]/link`.
   2. Route: `requireProjectAccess`; if `clientPortal.enabled && getActivePortalToken()` → return existing state; else `issuePortalToken`.
   3. `issuePortalToken`: 32 random bytes base64url; in one admin transaction revoke all active records for the project, `set` `client_portal_tokens/{sha256}`, update project `clientPortal.enabled=true`, `activeTokenHash`, `tokenIssuedAt`, `updatedAt`.
   4. Response carries `url = portalUrl(token)`. `PortalLinkCard` keeps that URL even when the follow-up GET (triggered by the `enabled` flag change) returns `url: null` on a keyless deployment (`issuedAt` match merge, lines 65-75).
   5. Copy link / header Share / `s` / `c` → `handleShareClientLink` re-reads state and copies, or routes to the Client tab with a toast.

2. **Client opens the page**
   1. `page.tsx` → `loadPortal` (React `cache`) → `loadClientPortalByToken` → `verifyPortalToken`.
   2. Verify: malformed tokens hash to `sha256('')`; always reads the token doc and a project doc (sentinel id `client-portal-no-such-project-sentinel` when no record); requires well-formed, record exists, active, no `revokedAt`, unexpired, project exists, `clientPortal.enabled === true`, pointer equals hash (timing-safe). Any failure → `PortalAuthError(404)` → "This link is no longer active".
   3. Loader reads timeline, asks, checklists with firebase-admin and calls `buildClientPortalView`.
   4. `ClientPortalScreen` renders server-side; only `PortalReview` (gets `review`, `token`) and `TrackPortalView` (gets `token`) are serialized to the browser.

3. **View counting**
   1. `TrackPortalView`: skip if `preview`; once per browser session (`sessionStorage` key `portal-view-sent:<token>`); waits for Firebase `onAuthStateChanged` — signed-in user → no beacon; anonymous or 1.5 s timeout → `POST /api/portal/[token]/view` with `{}`.
   2. Route: verify token; skip `preview:true` and bot UAs; write `portal_views` row + merge `clientFacing` counters (no `updatedAt`) + `touchPortalToken` (token `lastUsedAt`, `useCount++`).
   3. Team sees "Opened N× · last …" in `PortalLinkCard` (from live project doc) and the list via `ViewsPopover` → `GET /views`.

4. **What the projection includes** (`buildClientPortalView`)
   1. The plan: `project.clientPlan` (normalised). With none saved, `legacyClientPlan` turns what an old portal showed into one: each timeline phase with a `clientVisible` milestone becomes a stage (those milestones its "what you get", their span its dates), unphased visible milestones an "Other" stage, visible manual links the project files, and the pin is `currentPhaseId` or the first phase with unfinished work (`PLAN_COMPLETE` when all are done).
   2. `resolveClientPlan` against the checklists: every section is classified into a stage kind (`classifySections`) and its items counted toward the stage of that kind (or the nearest earlier one the plan still has). Current stage: status Delivered → every stage done; `clientFacing.currentStageId` = `'__complete__'` → every stage done; a pinned stage id → that stage; otherwise the earliest stage with open steps, skipping a stage nothing tracks once a later stage has work ticked. Before it = done, after it = upcoming.
   3. Stages carry title, state, dates, deliverables and files; only the current stage carries `percent` (floored, so never 100 until every step is settled). Nothing else from the checklist leaves: no step titles, no section titles (except the review card's), no `kind`.
   4. Files: only http(s) URLs survive `normalizeClientPlan`. Website URL = `webflowConfig.customDomain`; a visible manual link titled live/production/website counts only on a pre-plan portal.
   5. `lastUpdateAt` = the latest of the team's `clientFacing.lastUpdateAt`, the plan's `updatedAt` and, when any stage is tracked, the newest checklist `updatedAt` (a tick moves the tracker, so it is news).
   6. Asks = tasks with `needsClientInput && status !== 'done'`, `{id,title,dueDate}` only, sorted by due date.
   7. Brand = `clientPortal.brandName` → `project.client` → `project.name`; logo = `brandLogoUrl` → `project.logoUrl`; agency contact = `reviewOwnerEmail` → `assigneeEmails[0]` (not `contactEmails`). Status via `normalizeClientStatus` + portal label.
   8. Review = first `client_review` section (checklists in load order, sections by `order`) without an approval, else the last one (with `approvedAt`, `approvedNote`). Section title only, never item titles.

5. **Client approves a stage**
   1. `PortalReview` → `POST /api/portal/[token]/approve { stageKey, note }` (button disabled when `preview`).
   2. Route verifies token, splits `stageKey`, loads `project_checklists/{checklistId}`, checks `projectId` match and `role === 'client_review'` (or legacy mapping), then in a transaction appends a `StageApproval` to `delivery.approvals` unless one exists for the key.
   3. No checklist item is ticked. Team sees it in the delivery module's `ClientApprovalCard`.

6. **Rotate / disable**
   1. `rotate` → `issuePortalToken` (revokes old in the same transaction). Old link fails verify immediately.
   2. `disable` → `revokePortalTokens(..., { disable: true })`: revoke all active, delete `activeTokenHash`, set `enabled=false`. Branding/status/visibility are kept; re-enabling issues a new token.

7. **Plan: drafted, edited, tracked**
   1. Drafted at creation by the New project dialog (project-links): `draftClientPlan([AGENCY_START, ...template.sections, AGENCY_CLOSE], { startDate, endDate, templateId })`, i.e. the sections the checklist is about to get, written inside the same `createProject` call; the checklist is created right after. Or from the Client tab: `ClientPlanSetup` drafts from the project's live checklists (standard stages when there are none) and `savePlan`s it, clearing any pin.
   2. `planStageKinds`: the kinds the sections classify into, in canonical order (kickoff, discovery, design, build, review, launch, handover). The Webflow migration SOP gives all seven; the brand SOP gives Kickoff, Discovery, Design, Handover. Each stage gets `CLIENT_STAGE_DEFAULTS[kind]` (name, default days, starting "what you get" wording) and back-to-back dates from the start date, scaled to fit a target end date when one is given.
   3. The team edits in the Client tab; every change is one `updateClientPlan` transaction that normalises the plan and stamps `lastUpdateAt`. Rebuild re-drafts from the checklist, keeps the name, what-you-get lines and files of stages whose kind is still there, drops stages added by hand, and clears the pin.
   4. Live: ticking the checklist in the Delivery tab changes `resolveClientPlan`'s answer on the client's next page load. The Now card shows what the checklist says, lets the team pin a stage, and "Move to <next>" pins the next one (or `'__complete__'` after the last).

## Gotchas and invariants

- **The portal route must not import the module barrel.** `@/modules/client-portal` re-exports `'use client'` team UI (Client tab, repository); a route importing it ships ~326 KB of internal admin UI to the client. [page.tsx:6-9](../../src/app/portal/[token]/page.tsx) imports `ClientPortalScreen` directly; [eslint.config.mjs:84-95](../../eslint.config.mjs) turns off `no-restricted-imports` for `src/app/portal/**` with the explanation.
- **Server-only libs never go through the barrel.** `client-portal-tokens.ts`, `client-portal-auth.ts`, `client-portal.ts` start with `import 'server-only'`.
- **Adding a field to `ClientPortalView` is a product decision.** Keep `CLIENT_PORTAL_VIEW_KEYS` in step; the test asserts exact keys (on the view and on each stage) and that sentinel values on internal fields never appear.
- **The tracker is only as live as the checklist.** Auto mode picks the earliest stage with open steps, like the Delivery tab: a forgotten tick in Kickoff keeps the client on Kickoff. The Now card says which stage the checklist picks and how many of its steps are ticked, so the team can tick, skip, or pin.
- **Stage kinds come from section titles.** `kindOfSection` reads titles first (most specific patterns first: "pre-launch" is review, "post-launch" is handover), then the role. A custom SOP with unusual titles may group oddly; unmatched sections join the stage before them and the walk never goes backwards. Change the patterns with the real built-in SOPs' test cases in `client-plan.test.ts` green.
- **A pin is sticky.** Once the team picks a stage (or presses "Move to …"), checklist ticks no longer move the client's tracker until the select is set back to "Follow the checklist". Rebuilding the plan clears the pin.
- **Delivered wins.** A client status of Delivered shows every stage done, whatever the checklist or pin says.
- **Files are http(s) only**, checked twice: the editor refuses anything else, and `normalizeClientPlan` drops it again on every write and before every render. A bare `figma.com/...` is stored as `https://`.
- **Pre-plan portals keep working.** Until a plan is saved, the projection rebuilds the old page from `clientVisible` milestones and links (`legacyClientPlan`). No UI sets those flags any more: the Timeline tab's "Visible to client" switch and the Client tab's switch lists are gone. The Client tab offers "Keep these stages" (saves the same thing as a real plan and pins where it was) or a fresh plan from the checklist.
- **Plan edits count as telling the client something**: `updateClientPlan` stamps `clientFacing.lastUpdateAt`, which clears the stale-portal nudge.
- **One live link, by transaction + pointer.** Issue/revoke run in `adminDb.runTransaction` ([client-portal-tokens.ts:153-165, 182-194](../../src/lib/client-portal-tokens.ts)); verify requires the project's `activeTokenHash` to equal the hash ([:279-295](../../src/lib/client-portal-tokens.ts)). A stray active record can never resolve.
- **Uniform rejection.** Every failure path does the same two reads and throws the same 404 text. The no-record sentinel id must be a *valid* Firestore id: `__none__` is reserved and caused a 500 on every portal request ([client-portal-tokens.ts:240-252](../../src/lib/client-portal-tokens.ts)).
- **`enable` never revives a previously shared link** when the portal was switched off out-of-band ([link/route.ts:97-105](../../src/app/api/client-portal/[projectId]/link/route.ts)).
- **The raw token is never stored in the clear.** Doc id is SHA-256; optional ciphertext needs `CLIENT_PORTAL_TOKEN_KEY`. Changing the key makes existing links unreadable in the UI but does not invalidate them — rotate links for that.
- **The page loader is read-only; only the beacon counts.** Slack unfurls and previews never count. The comment at [page.tsx:23-24](../../src/app/portal/[token]/page.tsx) saying the loader "bumps useCount" is stale.
- **Client-driven writes never touch `updatedAt`** (beacon merge [view/route.ts:81-87](../../src/app/api/portal/[token]/view/route.ts); approval [approve/route.ts:105-107](../../src/app/api/portal/[token]/approve/route.ts)), so client activity cannot reorder the team's `updatedAt`-sorted lists. Team writes do bump it.
- **`updateClientFacing` only stamps freshness with `{ touch: true }`** ([database.ts](../../src/services/database.ts)). `lastUpdateAt` is the sole input to the stale nudge; the project card's status change deliberately omits `touch` ([ProjectCard.tsx:143-152](../../src/components/projects/ProjectCard.tsx)); the Client tab's Save and "Move to …" pass it ([ClientNowEditor.tsx](../../src/modules/client-portal/ui/components/ClientNowEditor.tsx)), and every plan edit stamps it too (`updateClientPlan`).
- **Plan writes are transactions** (`updateClientPlan` in [database.ts](../../src/services/database.ts)): the repository passes a pure edit that runs against the latest stored plan, so two people editing different stages at once do not undo each other. Firestore may run it more than once; keep edits free of side effects.
- **Asks have no switch.** Any not-done task with `needsClientInput` publishes its title verbatim. The flag is never cleared on completion, so the loader reads up to 500 flagged tasks and filters status in the projection ([client-portal.ts:88-92](../../src/lib/client-portal.ts)).
- **"Open site" is never guessed from an invisible link** — only the custom domain, or, on a pre-plan portal, a switched-on manual link ([client-portal.projection.ts](../../src/modules/client-portal/domain/client-portal.projection.ts) `detectWebsiteUrl`).
- **Approval is not a lock and ticks nothing.** Written only from `delivery.approvals`; the stage must be a real `client_review` section of a checklist belonging to the token's project ([approve/route.ts:66-83](../../src/app/api/portal/[token]/approve/route.ts)). `roleOf` is duplicated in the route and projection — keep them in step with delivery's.
- **Preview only disables Approve in the UI.** The approve route has no preview concept; a team member opening the real link (without `?preview=1`) can press Approve and it will record as the client's.
- **Signed-in team members are not counted**, but only if Firebase auth restores within 1.5 s; the settle logic in [TrackPortalView.tsx:52-73](../../src/modules/client-portal/ui/components/TrackPortalView.tsx) prevents the fallback timer double-firing.
- **Day math is viewer-local.** `daysSinceClientUpdate` converts the stored instant to the viewer's calendar day before differencing ([client-status.ts:19-22](../../src/modules/client-portal/domain/client-status.ts)).
- **Vercel preview deployments sit behind Vercel SSO**, so a portal link on a preview cannot be opened anonymously; test on production (`app.activeset.co` serves public routes). `CLIENT_PORTAL_TOKEN_KEY` must be identical across Production/Preview/Development because they share one Firebase project.

## Tests

| File | Runs with |
| --- | --- |
| [src/modules/client-portal/domain/client-portal.projection.test.ts](../../src/modules/client-portal/domain/client-portal.projection.test.ts) (17 cases) | `npm run test:client-portal` (also part of `npm run test:domain` and `npm test`) |
| [src/modules/client-portal/domain/client-plan.test.ts](../../src/modules/client-portal/domain/client-plan.test.ts) (22 cases) | same |
| [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) (rules emulator; covers deny-by-default collections) | `npm run test:rules` (needs Java + Firebase emulator) |

No tests cover `client-portal-tokens.ts`, the routes, or the UI. Locally the Client tab and New project dialog run against the localhost project bypass (plan, status and branding writes all have bypass branches); the portal page itself needs firebase-admin, so render `ClientPortalScreen` with a view from `buildClientPortalView` to see it. `npm run arch:check` (typecheck + architecture lint) should also pass.

## Adjacent: daily review (not client portal)

`src/lib/review-status.ts`, `src/lib/review-digest.ts`, `/api/cron/review-digest`, [DailyReviewBanner.tsx](../../src/components/projects/DailyReviewBanner.tsx) and [ProjectReviewToggle.tsx](../../src/components/projects/ProjectReviewToggle.tsx) are the **team's daily project review** (fields `lastReviewDate`, `lastReviewedAt`, `lastReviewedBy`, `reviewStreak` written by `projectsService.markProjectReviewed` / `unmarkProjectReviewed`). They are unrelated to what the client sees; the only overlap is that `client-status.ts` and `ClientUpdatesBanner` reuse `todayIso`/`daysBetweenIso`. "Live" for the banner and digest = `status === 'current'` with at least one tag. These belong with the project-links dashboard doc.

## Related docs

| Doc | Status |
| --- | --- |
| [docs/features/client-portal.md](../features/client-portal.md) | **Partially stale.** Accurate on security model, data model, approval, env. Describes the timeline-and-switches page that the client plan replaced (see Key flows 4 and 7 here). Also stale: says the Client tab is the "second tab, `2`" (it is third, `3`); says headers send `X-Robots-Tag: noindex` (actual `noindex, nofollow, noarchive`); omits `APP_BASE_URL` fallback; claims token record `label` is carried for per-contact links (field exists in the type but is never set). |
| [docs/features/website-delivery.md](../features/website-delivery.md) | Delivery internals, stage roles, `client_review` and the approval card. Its approval section agrees with the code. |
| [docs/features/keyboard-shortcuts.md](../features/keyboard-shortcuts.md) | `s` / `c` portal shortcuts: accurate. |
| [docs/plans/delivery-arc.md](../plans/delivery-arc.md) | Design background for stages/roles; not verified line by line. |
