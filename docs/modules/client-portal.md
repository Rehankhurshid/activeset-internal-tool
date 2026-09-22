---
module: client-portal
title: Client Portal
keywords: [client portal, portal link, project page, client tab, Client, share link, capability token, portal token, rotate, disable, enable portal, preview as client, client status, clientFacing, clientPortal, client_portal_tokens, portal_views, view beacon, opened, stale portal, Client updates due, Waiting on client, Waiting on you, needs_client, needs client input, asks, What we need from you, visible to client, clientVisible, deliverables, approval, approve, sign off, client_review, delivery.approvals, branding, welcome line, CLIENT_PORTAL_TOKEN_KEY, allow-list, projection, buildClientPortalView, daily review, review digest]
entry_points: [/portal/[token], /modules/project-links/[id]?tab=client, /modules/project-links]
code_roots: [src/modules/client-portal, src/app/portal/[token], src/app/api/portal/[token], src/app/api/client-portal/[projectId], src/lib/client-portal.ts, src/lib/client-portal-tokens.ts, src/lib/client-portal-auth.ts]
last_verified: 2026-09-23 @ a00f91e
---
# Client Portal

> A private, sign-in-free, read-mostly page per project (`/portal/<token>`) that the agency sends to a client. It shows the client-facing status and a one-line note, the plan (only milestones the team switched on), deliverables (only links the team switched on), open "What we need from you" asks, and — when a checklist stage carries the `client_review` role — one Approve button, which is the only write a client can make. The team runs it from the **Client** tab on a project (link enable/rotate/disable, status editor, visibility switches, branding) and sees client-facing signals on the project dashboard (status chip, "shared / waiting on client / stale" counts, a "Waiting on client" filter, and a "Client updates due" banner). The token in the URL is the only credential. Everything the client receives is built server-side by one allow-list projection, `buildClientPortalView`.

## Where to find things (quick lookup)

| I want to… | Go to |
| --- | --- |
| Change what the client can see (add/remove a field) | [client-portal.projection.ts](../../src/modules/client-portal/domain/client-portal.projection.ts) `buildClientPortalView` + `CLIENT_PORTAL_VIEW_KEYS` in [client-portal.types.ts](../../src/modules/client-portal/domain/client-portal.types.ts); update the test |
| Change how tokens are minted/rotated/revoked | [client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) `issuePortalToken`, `revokePortalTokens` |
| Change how a link is verified | [client-portal-tokens.ts](../../src/lib/client-portal-tokens.ts) `verifyPortalToken` |
| Change what the portal page loads from Firestore | [client-portal.ts](../../src/lib/client-portal.ts) `loadClientPortalByToken` |
| Change the portal page layout | [ClientPortalScreen.tsx](../../src/modules/client-portal/ui/screens/ClientPortalScreen.tsx) and `Portal*` components in [ui/components](../../src/modules/client-portal/ui/components/) |
| Change the "no longer active" / "temporarily unavailable" notices | [page.tsx](../../src/app/portal/[token]/page.tsx) `PortalNotice`, `UnavailableNotice` |
| Change view counting / bot filtering | [view/route.ts](../../src/app/api/portal/[token]/view/route.ts) `BOT_UA_PATTERN`; client side [TrackPortalView.tsx](../../src/modules/client-portal/ui/components/TrackPortalView.tsx) |
| Change the client approval write | [approve/route.ts](../../src/app/api/portal/[token]/approve/route.ts); card UI [PortalReview.tsx](../../src/modules/client-portal/ui/components/PortalReview.tsx) |
| See the team-side approval record | [ClientApprovalCard.tsx](../../src/modules/delivery/ui/components/ClientApprovalCard.tsx) (delivery module) |
| Change the Client tab | [ClientPanel.tsx](../../src/modules/client-portal/ui/screens/ClientPanel.tsx); mounted in [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) |
| Change the link card (Enable / Copy / Preview / Rotate / Disable / "Opened N×") | [PortalLinkCard.tsx](../../src/modules/client-portal/ui/components/PortalLinkCard.tsx) |
| Change the status/note/current-phase editor | [ClientStatusEditor.tsx](../../src/modules/client-portal/ui/components/ClientStatusEditor.tsx) |
| Change milestone/link visibility switches | [PortalVisibilityLists.tsx](../../src/modules/client-portal/ui/components/PortalVisibilityLists.tsx); writes via `timelineService.setMilestoneClientVisible` ([TimelineService.ts](../../src/services/TimelineService.ts)) and `projectsService.updateLinkClientVisibility` ([database.ts](../../src/services/database.ts)) |
| Change branding fields | [PortalBrandingFields.tsx](../../src/modules/client-portal/ui/components/PortalBrandingFields.tsx) → `projectsService.updateClientPortalSettings` |
| Change the stale threshold (7 days) | [client-status.ts](../../src/modules/client-portal/domain/client-status.ts) `PORTAL_STALE_AFTER_DAYS`, `isPortalStale` |
| Change client status values/labels | [src/types/index.ts](../../src/types/index.ts) `ClientStatus`, `CLIENT_STATUS_LABELS` (internal), `CLIENT_STATUS_PORTAL_LABELS` (client wording) |
| Change the dashboard chip | [ClientStatusChip.tsx](../../src/modules/client-portal/ui/components/ClientStatusChip.tsx) (used by [ProjectCard.tsx](../../src/components/projects/ProjectCard.tsx)) |
| Change the "Client updates due" banner | [ClientUpdatesBanner.tsx](../../src/components/projects/ClientUpdatesBanner.tsx) |
| Change the header "Share" button / `s` / `c` shortcuts | `handleShareClientLink` in [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx); [ProjectShortcuts.tsx](../../src/modules/project-links/ui/components/ProjectShortcuts.tsx) |
| Change the portal URL origin | [base-url.ts](../../src/lib/base-url.ts) `getBaseUrl`, `portalUrl` |
| Change portal response headers (no-referrer, noindex) | [next.config.ts](../../next.config.ts) `headers()` |
| Toggle "Needs client input" on a task | [TaskTable.tsx](../../src/components/tasks/TaskTable.tsx) actions column |
| Toggle "Visible to client" on a milestone from the Timeline tab | [TimelineEditSheet.tsx](../../src/modules/timeline/ui/components/TimelineEditSheet.tsx), [TimelineList.tsx](../../src/modules/timeline/ui/components/TimelineList.tsx) |

## User-facing pages

| URL | File | What it shows | Access |
| --- | --- | --- | --- |
| `/portal/[token]` | [src/app/portal/[token]/page.tsx](../../src/app/portal/[token]/page.tsx) → [ClientPortalScreen.tsx](../../src/modules/client-portal/ui/screens/ClientPortalScreen.tsx) | Light-theme (`.portal-theme`), max ~760px page: header (brand logo/name, project name, welcome), status card (chip, note, phase stepper, next milestone, progress, last update), plan, deliverables + "Open site", asks (only when any), review/approval card (only when a `client_review` stage exists), footer (agency contact mailto, "private to …"). `?preview=1` shows a preview banner, suppresses the beacon and disables Approve. | Anyone holding a valid token. No login. `force-dynamic`, `revalidate = 0`, robots `noindex,nofollow,nocache`. |
| `/modules/project-links/[id]` → **Client** tab (`?tab=client`, keyboard `3`, since it is the 3rd tab after Audit and Delivery) | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) → [ClientPanel.tsx](../../src/modules/client-portal/ui/screens/ClientPanel.tsx) (loaded with `next/dynamic`, `ssr: false`) | Portal link card, "Status the client sees" editor, "What the client can see" switches (milestones grouped by phase, manual links; empty timeline → "Start plan from template"), "What the client is being asked" (read-only published asks), Branding. Tab stat shows internal client-status label or "Off". | Signed-in team (project access). |
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
| [index.ts](../../src/modules/client-portal/index.ts) | Barrel. Exports domain (`buildClientPortalView`, labels, `isPortalStale`, `daysSinceClientUpdate`, `ageLabel`, `PORTAL_STALE_AFTER_DAYS`, `CLIENT_STATUS_ORDER`), `clientPortalRepository`, `ClientPortalScreen`, `ClientPanel`, `ClientStatusChip`. **Must not be imported by `src/app/portal/**`** (see Gotchas). |
| [domain/client-portal.types.ts](../../src/modules/client-portal/domain/client-portal.types.ts) | `ClientPortalView` (the only payload the page gets), `PortalPhaseView`, `PortalMilestoneView`, `PortalDeliverableView`, `PortalAskView`, `PortalReviewView`, `PortalMilestoneStatus` + `PORTAL_MILESTONE_LABELS`, `CLIENT_PORTAL_VIEW_KEYS`. Re-exports client status types/labels from `@/types`. |
| [domain/client-portal.projection.ts](../../src/modules/client-portal/domain/client-portal.projection.ts) | `buildClientPortalView({ project, timeline, tasks, checklists, now })` — the allow-list. Also `detectWebsiteUrl`, `toPortalReview`, `reviewRoleOf` (duplicate of delivery's `roleOf`). |
| [domain/client-status.ts](../../src/modules/client-portal/domain/client-status.ts) | `PORTAL_STALE_AFTER_DAYS = 7`, `CLIENT_STATUS_ORDER`, `daysSinceClientUpdate` (viewer-local calendar days), `isPortalStale`, `ageLabel`. |
| [domain/client-portal.projection.test.ts](../../src/modules/client-portal/domain/client-portal.projection.test.ts) | 18 `node:test` cases: key allow-list, sentinel non-leakage, visibility, phase/stepper rules, asks, branding overrides, review selection. |
| [infrastructure/client-portal.repository.ts](../../src/modules/client-portal/infrastructure/client-portal.repository.ts) | `'use client'`. `clientPortalRepository`: `getLinkState`, `setLink`, `listViews` (via `fetchAuthed` to the team routes) and pass-throughs to `projectsService.updateClientFacing`, `markClientUpdated`, `updateClientPortalSettings`, `updateLinkClientVisibility`. Types `PortalLinkState`, `PortalViewRow`, `PortalLinkAction`. |
| [ui/screens/ClientPortalScreen.tsx](../../src/modules/client-portal/ui/screens/ClientPortalScreen.tsx) | Server component composing the portal page. Only `PortalReview` and `TrackPortalView` are client components on this page. |
| [ui/screens/ClientPanel.tsx](../../src/modules/client-portal/ui/screens/ClientPanel.tsx) | Team Client tab. Also contains local `PublishedAsks` (read-only list of open `needsClientInput` tasks, links to `?tab=tasks`). `isAdmin` prop is accepted but unused. |
| ui/components (portal side) | [PortalHeader](../../src/modules/client-portal/ui/components/PortalHeader.tsx), [PortalStatusCard](../../src/modules/client-portal/ui/components/PortalStatusCard.tsx), [PortalStatusChip](../../src/modules/client-portal/ui/components/PortalStatusChip.tsx), [PortalPhaseStepper](../../src/modules/client-portal/ui/components/PortalPhaseStepper.tsx), [PortalPlan](../../src/modules/client-portal/ui/components/PortalPlan.tsx), [PortalDeliverables](../../src/modules/client-portal/ui/components/PortalDeliverables.tsx), [PortalAsks](../../src/modules/client-portal/ui/components/PortalAsks.tsx), [PortalReview](../../src/modules/client-portal/ui/components/PortalReview.tsx) (client; Approve), [PortalFooter](../../src/modules/client-portal/ui/components/PortalFooter.tsx), [PortalSectionHeading](../../src/modules/client-portal/ui/components/PortalSectionHeading.tsx), [ActiveSetWordmark](../../src/modules/client-portal/ui/components/ActiveSetWordmark.tsx), [TrackPortalView](../../src/modules/client-portal/ui/components/TrackPortalView.tsx) (client; beacon), [portal-format.ts](../../src/modules/client-portal/ui/components/portal-format.ts) (`formatDay`, `formatDateRange`, `formatRelativeDay`, `hostnameOf`, `brandInitial`). |
| ui/components (team side) | [PortalLinkCard](../../src/modules/client-portal/ui/components/PortalLinkCard.tsx), [ClientStatusEditor](../../src/modules/client-portal/ui/components/ClientStatusEditor.tsx) (Save = `touch: true`; "Mark updated"; note max 160), [PortalVisibilityLists](../../src/modules/client-portal/ui/components/PortalVisibilityLists.tsx), [StartPlanFromTemplate](../../src/modules/client-portal/ui/components/StartPlanFromTemplate.tsx) (`timelineRepository.applyTemplate` with `TIMELINE_TEMPLATES`), [PortalBrandingFields](../../src/modules/client-portal/ui/components/PortalBrandingFields.tsx) (brand name, welcome, client contacts), [ClientStatusChip](../../src/modules/client-portal/ui/components/ClientStatusChip.tsx) (renders nothing unless enabled), [copy-text.ts](../../src/modules/client-portal/ui/components/copy-text.ts). |

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
| [src/lib/client-portal.ts](../../src/lib/client-portal.ts) | `server-only`. `loadClientPortalByToken`: verify → read timeline, `needsClientInput` tasks (limit 500), checklists (limit 20) with firebase-admin → `buildClientPortalView`. Returns `null` for 404-class rejections, rethrows infra errors. |
| [src/lib/base-url.ts](../../src/lib/base-url.ts) | `getBaseUrl`, `portalPath`, `portalUrl`. |
| [src/services/database.ts](../../src/services/database.ts) `projectsService` | Client-SDK writes: `updateClientFacing(projectId, patch, byEmail, { touch })`, `markClientUpdated`, `updateClientPortalSettings` (brandName, brandLogoUrl, welcome, contactEmails; never `enabled`), `updateLinkClientVisibility` (transaction). |
| [src/services/TimelineService.ts](../../src/services/TimelineService.ts) | `setMilestoneClientVisible` (transaction), exposed via `timelineRepository` in [src/modules/timeline](../../src/modules/timeline/index.ts). |
| [src/lib/constants.ts](../../src/lib/constants.ts) | `COLLECTIONS.CLIENT_PORTAL_TOKENS = 'client_portal_tokens'`, `COLLECTIONS.CLIENT_PORTAL_VIEWS = 'portal_views'`. |
| [src/lib/ui-tones.ts](../../src/lib/ui-tones.ts) | `CLIENT_STATUS_TONES` for chips/editor. |
| [src/lib/review-status.ts](../../src/lib/review-status.ts) | `todayIso`, `daysBetweenIso` (used by client-status for day math) plus daily-review helpers. |

### Types (`src/types/index.ts`)

`ClientStatus`, `CLIENT_STATUSES`, `CLIENT_STATUS_LABELS`, `CLIENT_STATUS_PORTAL_LABELS`, `normalizeClientStatus` (unknown → `on_track`), `ClientPortalSettings`, `ClientFacingState`, `StageApproval`, `StageRole`, `Project.clientPortal`, `Project.clientFacing`, `Project.delivery.approvals`, `ProjectLink.clientVisible`, `TimelineMilestone.clientVisible`, `Task.needsClientInput`.

## Data model

| Path | One document = | Key fields (type, file) | Written by | Read by | SDK |
| --- | --- | --- | --- | --- | --- |
| `projects/{id}.clientPortal` | map on the project | `ClientPortalSettings` ([types](../../src/types/index.ts)): `enabled`, `activeTokenHash`, `tokenIssuedAt` (server, in token transactions); `brandName`, `brandLogoUrl`, `welcome`, `contactEmails` (team) | `issuePortalToken`/`revokePortalTokens` (admin); `updateClientPortalSettings` (client SDK) | verify, projection, dashboard, Client tab | both |
| `projects/{id}.clientFacing` | map on the project | `ClientFacingState`: `status`, `statusNote`, `currentPhaseId`, `lastUpdateAt`, `lastUpdateBy` (team); `viewCount`, `lastViewedAt`, `lastViewCountry`, `lastViewCity` (beacon); `openRequestCount` (declared, never written) | team via `updateClientFacing`/`markClientUpdated` (bump `updatedAt`); beacon via admin merge (no `updatedAt`) | projection, chip, banner, dashboard | both |
| `projects/{id}.delivery.approvals[]` | one client sign-off | `StageApproval`: `stageKey` (`checklistId:sectionId`), `stageTitle`, `approvedAt`, `note?` | approve route (admin, transaction, merge, no `updatedAt`) | projection (`review`), `ClientApprovalCard` | admin write |
| `projects/{id}.links[].clientVisible` | flag on a manual link | `ProjectLink.clientVisible` | `updateLinkClientVisibility` (client SDK txn) | projection (deliverables, website URL) | client |
| `project_timelines/{projectId}` `.phases[]`, `.milestones[].clientVisible` | the project's plan | `ProjectTimeline`, `TimelineMilestone` | Timeline tab + Client tab switches (client SDK) | loader (admin) | both |
| `tasks` where `projectId`, `needsClientInput == true` | a task; open ones become asks (title + dueDate only) | `Task.needsClientInput`, `status`, `dueDate`, `order` | Tasks tab (client SDK) | loader (admin, limit 500), `PublishedAsks` | both |
| `project_checklists` where `projectId` | checklist; sections with role `client_review` (or legacy `stage`) become the review card | `ProjectChecklist`, `ChecklistSection.role` | checklist/delivery UI | loader (limit 20), approve route | admin read |
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
   1. Phases sorted by `order`, each with only `clientVisible === true` milestones; phases with none are dropped (not in stepper, not in count).
   2. Current phase = `clientFacing.currentPhaseId` if it survives the filter, else first phase with a non-done visible milestone. Visible milestones without a (surviving) phase go into a synthetic `__ungrouped` "Other" group, excluded from the phase count.
   3. Milestone status mapped: `not_started→upcoming`, `in_progress→in_progress`, `completed→done`, `blocked→on_hold`. Progress = completed/total visible. Next = earliest non-completed visible.
   4. Deliverables = manual (`source !== 'auto'`) links with `clientVisible === true`. Website URL = `webflowConfig.customDomain`, else a visible manual link titled live/production/website and not staging/dev.
   5. Asks = tasks with `needsClientInput && status !== 'done'`, `{id,title,dueDate}` only, sorted by due date.
   6. Brand = `clientPortal.brandName` → `project.client` → `project.name`; logo = `brandLogoUrl` → `project.logoUrl`; agency contact = `reviewOwnerEmail` → `assigneeEmails[0]` (not `contactEmails`). Status via `normalizeClientStatus` + portal label.
   7. Review = first `client_review` section (checklists in load order, sections by `order`) without an approval, else the last one (with `approvedAt`, `approvedNote`). Section title only, never item titles.

5. **Client approves a stage**
   1. `PortalReview` → `POST /api/portal/[token]/approve { stageKey, note }` (button disabled when `preview`).
   2. Route verifies token, splits `stageKey`, loads `project_checklists/{checklistId}`, checks `projectId` match and `role === 'client_review'` (or legacy mapping), then in a transaction appends a `StageApproval` to `delivery.approvals` unless one exists for the key.
   3. No checklist item is ticked. Team sees it in the delivery module's `ClientApprovalCard`.

6. **Rotate / disable**
   1. `rotate` → `issuePortalToken` (revokes old in the same transaction). Old link fails verify immediately.
   2. `disable` → `revokePortalTokens(..., { disable: true })`: revoke all active, delete `activeTokenHash`, set `enabled=false`. Branding/status/visibility are kept; re-enabling issues a new token.

## Gotchas and invariants

- **The portal route must not import the module barrel.** `@/modules/client-portal` re-exports `'use client'` team UI (Client tab, repository); a route importing it ships ~326 KB of internal admin UI to the client. [page.tsx:6-9](../../src/app/portal/[token]/page.tsx) imports `ClientPortalScreen` directly; [eslint.config.mjs:84-95](../../eslint.config.mjs) turns off `no-restricted-imports` for `src/app/portal/**` with the explanation.
- **Server-only libs never go through the barrel.** `client-portal-tokens.ts`, `client-portal-auth.ts`, `client-portal.ts` start with `import 'server-only'`.
- **Adding a field to `ClientPortalView` is a product decision.** Keep `CLIENT_PORTAL_VIEW_KEYS` in step; the test asserts exact keys and that sentinel values on internal fields never appear.
- **One live link, by transaction + pointer.** Issue/revoke run in `adminDb.runTransaction` ([client-portal-tokens.ts:153-165, 182-194](../../src/lib/client-portal-tokens.ts)); verify requires the project's `activeTokenHash` to equal the hash ([:279-295](../../src/lib/client-portal-tokens.ts)). A stray active record can never resolve.
- **Uniform rejection.** Every failure path does the same two reads and throws the same 404 text. The no-record sentinel id must be a *valid* Firestore id: `__none__` is reserved and caused a 500 on every portal request ([client-portal-tokens.ts:240-252](../../src/lib/client-portal-tokens.ts)).
- **`enable` never revives a previously shared link** when the portal was switched off out-of-band ([link/route.ts:97-105](../../src/app/api/client-portal/[projectId]/link/route.ts)).
- **The raw token is never stored in the clear.** Doc id is SHA-256; optional ciphertext needs `CLIENT_PORTAL_TOKEN_KEY`. Changing the key makes existing links unreadable in the UI but does not invalidate them — rotate links for that.
- **The page loader is read-only; only the beacon counts.** Slack unfurls and previews never count. The comment at [page.tsx:23-24](../../src/app/portal/[token]/page.tsx) saying the loader "bumps useCount" is stale.
- **Client-driven writes never touch `updatedAt`** (beacon merge [view/route.ts:81-87](../../src/app/api/portal/[token]/view/route.ts); approval [approve/route.ts:105-107](../../src/app/api/portal/[token]/approve/route.ts)), so client activity cannot reorder the team's `updatedAt`-sorted lists. Team writes do bump it.
- **`updateClientFacing` only stamps freshness with `{ touch: true }`** ([database.ts:1231-1250](../../src/services/database.ts)). `lastUpdateAt` is the sole input to the stale nudge; the project card's status change deliberately omits `touch` ([ProjectCard.tsx:138-147](../../src/components/projects/ProjectCard.tsx)); Client tab Save passes it ([ClientStatusEditor.tsx:106-108](../../src/modules/client-portal/ui/components/ClientStatusEditor.tsx)).
- **Visibility writes are transactions** (`updateLinkClientVisibility` [database.ts:1327](../../src/services/database.ts), `setMilestoneClientVisible` [TimelineService.ts:141](../../src/services/TimelineService.ts)). Read-modify-write versions lost updates when switches were flipped quickly, re-exposing things the team hid.
- **Asks have no switch.** Any not-done task with `needsClientInput` publishes its title verbatim. The flag is never cleared on completion, so the loader reads up to 500 flagged tasks and filters status in the projection ([client-portal.ts:88-92](../../src/lib/client-portal.ts)).
- **"Open site" is never guessed from an invisible link** — only custom domain or a switched-on manual link ([client-portal.projection.ts:50-68](../../src/modules/client-portal/domain/client-portal.projection.ts)).
- **Approval is not a lock and ticks nothing.** Written only from `delivery.approvals`; the stage must be a real `client_review` section of a checklist belonging to the token's project ([approve/route.ts:66-83](../../src/app/api/portal/[token]/approve/route.ts)). `roleOf` is duplicated in the route and projection — keep them in step with delivery's.
- **Preview only disables Approve in the UI.** The approve route has no preview concept; a team member opening the real link (without `?preview=1`) can press Approve and it will record as the client's.
- **Signed-in team members are not counted**, but only if Firebase auth restores within 1.5 s; the settle logic in [TrackPortalView.tsx:52-73](../../src/modules/client-portal/ui/components/TrackPortalView.tsx) prevents the fallback timer double-firing.
- **Day math is viewer-local.** `daysSinceClientUpdate` converts the stored instant to the viewer's calendar day before differencing ([client-status.ts:19-22](../../src/modules/client-portal/domain/client-status.ts)).
- **Vercel preview deployments sit behind Vercel SSO**, so a portal link on a preview cannot be opened anonymously; test on production (`app.activeset.co` serves public routes). `CLIENT_PORTAL_TOKEN_KEY` must be identical across Production/Preview/Development because they share one Firebase project.

## Tests

| File | Runs with |
| --- | --- |
| [src/modules/client-portal/domain/client-portal.projection.test.ts](../../src/modules/client-portal/domain/client-portal.projection.test.ts) (18 cases) | `npm run test:client-portal` (also part of `npm run test:domain` and `npm test`) |
| [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) (rules emulator; covers deny-by-default collections) | `npm run test:rules` (needs Java + Firebase emulator) |

No tests cover `client-portal-tokens.ts`, the routes, or the UI. `npm run arch:check` (typecheck + architecture lint) should also pass.

## Adjacent: daily review (not client portal)

`src/lib/review-status.ts`, `src/lib/review-digest.ts`, `/api/cron/review-digest`, [DailyReviewBanner.tsx](../../src/components/projects/DailyReviewBanner.tsx) and [ProjectReviewToggle.tsx](../../src/components/projects/ProjectReviewToggle.tsx) are the **team's daily project review** (fields `lastReviewDate`, `lastReviewedAt`, `lastReviewedBy`, `reviewStreak` written by `projectsService.markProjectReviewed` / `unmarkProjectReviewed`). They are unrelated to what the client sees; the only overlap is that `client-status.ts` and `ClientUpdatesBanner` reuse `todayIso`/`daysBetweenIso`. "Live" for the banner and digest = `status === 'current'` with at least one tag. These belong with the project-links dashboard doc.

## Related docs

| Doc | Status |
| --- | --- |
| [docs/features/client-portal.md](../features/client-portal.md) | **Partially stale.** Accurate on security model, data model, approval, env. Stale: says the Client tab is the "second tab, `2`" (it is third, `3`); says headers send `X-Robots-Tag: noindex` (actual `noindex, nofollow, noarchive`); omits `APP_BASE_URL` fallback; claims token record `label` is carried for per-contact links (field exists in the type but is never set). |
| [docs/features/website-delivery.md](../features/website-delivery.md) | Delivery internals, stage roles, `client_review` and the approval card. Its approval section agrees with the code. |
| [docs/features/keyboard-shortcuts.md](../features/keyboard-shortcuts.md) | `s` / `c` portal shortcuts: accurate. |
| [docs/plans/delivery-arc.md](../plans/delivery-arc.md) | Design background for stages/roles; not verified line by line. |
