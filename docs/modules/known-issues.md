---
module: known-issues
title: Known issues found while documenting (not fixed)
keywords: [bugs, security, auth, open rules, unauthenticated, dead code, broken, tech debt, known issues, TODO, drift]
last_verified: 2026-09-23 @ a00f91e
---
# Known issues (found while documenting, not fixed)

> Everything below was found by reading the code at `a00f91e` while writing the module docs. **None of it has been fixed, and most of it has not been reproduced at runtime.** Treat each item as a lead to verify, not a confirmed bug. Details, with file and line citations, are in each module doc's *Gotchas* section or its related notes. When you fix one, delete its line here.

## 1. Security: routes and data open to anyone

Background: the repo has no `middleware.ts`/`proxy.ts`, so every API route must authenticate itself. About 66 of 124 `route.ts` files call none of the shared helpers in [api-auth.ts](../../src/lib/api-auth.ts). Some are public on purpose (portal, cron, webhooks). The ones below looked unintentional.

| Area | Issue | Doc |
|---|---|---|
| Proposals | Every proposal is copied to `shared_proposals` on create/update, and the rules allow anyone to **list** that collection. With the public web API key, anyone can pull every proposal, including drafts and pricing. | [proposal.md](./proposal.md) |
| Proposals | `/api/ai/proposal-draft` and `/api/ai/proposal-block` have no auth: they spend AI credit, and the site scraper fetches any URL it is given. `/api/generate-pdf` (Chromium, up to 300 s) and `/api/send-notification` (emails any address) have no auth either. | proposal.md |
| Settings | `configurations` is world-writable in `firestore.rules`, and `/modules/proposal/settings` has no auth check. | [platform.md](./platform.md), proposal.md |
| Client portal | The portal sends `stageKey = "<checklistId>:<sectionId>"` to the browser. `project_checklists`, `tasks` and `project_timelines` are `allow read: if true`, so anyone with a portal link could read the raw checklist, tasks and milestone notes directly and get around the allow-listed projection. | [client-portal.md](./client-portal.md) |
| Client portal | `?preview=1` only disables the Approve button in the UI. The approve route does not check for preview, so a teammate opening a real link can record an approval that looks like the client's. | client-portal.md |
| Scanning | No scan route checks the caller (only `/api/scan-bulk/process` and the crons check `CRON_SECRET`). Anyone with a `projectId`/`scanId` can start, cancel or read scans. `scan_jobs`, `audit_logs`, `content_changes` and `scan_notifications` are open for read and write in the rules. | [site-audit.md](./site-audit.md) |
| Monitoring | `/api/alerts` has no auth, so anyone can dismiss or mark-read all alerts. `/api/scan-bulk/notify` (unused) can spam Slack and email. `/api/scan-bulk/debug-notifications` leaks the first 30 characters of the Slack webhook; it is marked "Remove after debugging". `/api/capture-screenshot` and `/api/compare-screenshots` have no auth. `site_alerts` and `health_reports` rules are `if true`. | [site-monitoring.md](./site-monitoring.md) |
| Webflow | No auth on `validate-token`, `ai-seo-gen` (spends Gemini quota), `schema/scrape` (fetches any URL from the server), `cms/progress/start`, `schema/progress/start` and `webflow/session`. `cmsRuns`, `schemaRuns` and `schema_analyses`, including run secrets, are world-readable and world-writable. Routes trust the `siteId`/`collectionId`/`assetId` the caller sends and never check it against `webflowConfig.siteId`. | [webflow.md](./webflow.md) |
| Delivery | `POST /api/ai-checklist` has no auth (spends the Gemini key). `/api/delivery/basics-gap` checks sign-in but not project access. `sop_templates` and `timeline_templates` are world-writable. | [delivery.md](./delivery.md) |
| Worker | A job's `payload.emitDir` is used as the output folder when `WORKER_EMIT_DIR` is unset. Any `@activeset.co` user can create a job, so on such a machine a job can choose where the worker writes files. | [worker-alt-text-images.md](./worker-alt-text-images.md) |
| Captures | The upload HMAC key defaults to a constant (`activeset-capture-v1`) that ships in the public npm package. The `file`/`finalize` phases only check that the run id exists, and `init` overwrites any run with the same predictable id. `/captures/[runId]`, `/api/capture-runs` and the stored images are public. | [tools-and-extensions.md](./tools-and-extensions.md) |
| Raycast | The shared Raycast token grants `isAdmin: true`, the caller picks their own identity via the `x-activeset-user-email` header, and the token comparison is not timing-safe. | tools-and-extensions.md |
| Misc | `/api/favicon` and `/api/proxy-image` fetch any URL for anyone. `storage.rules` allows public writes to `screenshots/**` (and `firebase.json` doesn't deploy storage rules). Every `/api/*` response sends `Access-Control-Allow-Origin: *` together with `Allow-Credentials: true`. `ACTIVESET_UPLOAD_KEY` and `PROPOSAL_VIEW_IP_SALT` fall back to committed constants. | platform.md, [project-links.md](./project-links.md) |
| Local dev | On localhost with real admin credentials, the app always signs in as `local-dev@activeset.co` with admin rights. If `.env.local` points at production, local writes go to production and a real Auth user is created there. | platform.md |

## 2. Probably broken

| Issue | Doc |
|---|---|
| `/api/save-audit`, `/api/audit-config`, `/api/audit`, `/api/capture-screenshot` and `/api/scan-bulk/notify` read `projects` with the **browser** Firestore SDK on the server, where there is no signed-in user. The `projects` rules require sign-in, so these likely fail with permission-denied. The embed widget's Links tab has the same problem for visitors who aren't signed in. | site-audit.md, project-links.md |
| The scan notification queue's `docToJob` drops `startedAt`, so anomaly detection runs over **all** pages rather than the scanned ones, and old problems are re-alerted on every scan. | site-monitoring.md |
| A failed notification job is retried by every drain with no attempt limit, recreating the same `site_alerts` rows and re-sending the email and Slack message each time. `collection_meta_conflict` checks current state rather than a change, and is critical, so it fires on every scan. | site-monitoring.md |
| `compareImages` ([image-diff.ts](../../src/lib/image-diff.ts)) only decodes PNG, but screenshots are now WebP, so `/api/compare-screenshots` fails on recent captures. | site-monitoring.md |
| ClickUp webhook registration uses `NEXT_PUBLIC_APP_URL \|\| VERCEL_URL`. If the first is unset in production, the webhook targets the SSO-protected `*.vercel.app` host (the same trap as the cron self-call). | [clickup-tasks.md](./clickup-tasks.md) |
| ClickUp: `/api/clickup/link` sets `source:'clickup'` on a manually created task, which makes it deletable when the ClickUp side goes away. Deleting a linked task locally doesn't delete it in ClickUp, so it comes back. The refresh cron only reads 200 tasks, with no cursor. Raycast edits and unmapped statuses get reverted by the next inbound sync. | clickup-tasks.md |
| Webflow Pages tab fetches only the first 100 pages (no offset). | webflow.md |
| Turning off payment terms on an existing proposal likely leaves the old value in Firestore, because undefined fields are stripped before a merge write. Invoices reads that field. | proposal.md |
| Skydo bridge: admins can pair, but the server's per-request module check has no admin exception, so admins not listed under `invoices` get 403. The Invoices tab and `/api/refrens/*` are admin-only regardless of the `invoices` grant. | tools-and-extensions.md |
| `alt_apply` marks every fingerprint as applied, even when its PATCH chunk failed, writing `fixed_unverified` decisions for fields that were never written. | worker-alt-text-images.md |
| `/pages/[url]` renders the page-details screen with no props, so it never loads. | site-audit.md |
| `npm run lint` runs `next lint`, which doesn't exist in Next 16. The ESLint boundary config lists a non-existent `seo-engine` module and misses `internal-tools`, `invoices` and `timeline`. | platform.md |
| `scripts/schema-gen.ts` imports firebase-admin before `dotenv.config`, which is the same import-before-dotenv trap the worker had. | webflow.md |

## 3. Data integrity and concurrency

- `project.links` is rewritten whole on every change, so simultaneous edits can overwrite each other. Drag-reorder rewrites every link's audit doc and can save `temp_id_*` ids (project-links.md).
- Checklist item edits rewrite the whole `sections` array without a transaction, so two simultaneous ticks can drop one. `movePage` uses `getDocs` inside `runTransaction` (delivery.md).
- `deleteProject` (and the Raycast delete) removes only the project doc. Subcollections, tasks, checklists, timelines and requests are left behind (project-links.md).
- Replacing a timeline from Markdown clears it before importing, so a failed import leaves it empty. The Markdown format drops client visibility, so a round trip hides every milestone from the portal (delivery.md).
- Sitemap sync deletes a removed page's `audit_logs`/`content_changes` but leaves its `link_audits` doc (site-audit.md).
- Stored audits keep only 8 images and 8 broken links per page, so heavy pages undercount (site-audit.md).
- Three proposal writes replace the whole doc and can drop a concurrently counted view (proposal.md).

## 4. Crons that exist but never run

`/api/cron/cleanup` (the only thing that prunes `audit_logs` and `content_changes`) and `/api/cron/scan-notifications` are not in [vercel.json](../../vercel.json). The notification queue is drained only by `/api/cron/scan-jobs` (site-monitoring.md, platform.md).

## 5. Dead code (safe-to-remove candidates; confirm no importers first)

`src/components/projects/AuditDashboard.tsx`, `ProjectStats`, `DropdownWidget`, `components/dashboard/Dashboard`, `src/components/scan-sitemap-dialog.tsx`, `src/components/source-diff-viewer.tsx`, `ModeToggle`, `WebflowSchemaPanel` + `useSchemaAnalysis` + `/api/schema/scrape`, `WebflowSEOHealthBadge`, `src/platform/webflow/utils.ts`, `ChecklistProgressBadge`, `useDebounce`, `useEditableField`, `CLICKUP_SYNCED_FIELDS`, `/api/ping`, `/api/audit`, `/api/scan-bulk/notify`, `/api/scan-bulk/debug-notifications`, `cms/update` + `cms/publish` + `cms/progress/*` (only the `cms-alt` CLI uses progress), `scripts/test-local-api.ts` (calls the removed `/api/ai-gen`), unused `projectsService` methods and unused proposal-history helpers (see each doc). `src/services/LinkCheckerService.test.ts` isn't wired into any npm script, and `npm test` runs the site-monitoring tests twice.

## 6. Duplicated sources of truth

- The admin list is hard-coded in three places: [AccessControlService.ts](../../src/services/AccessControlService.ts), [api-auth.ts](../../src/lib/api-auth.ts) and [firestore.rules](../../firestore.rules). Admins are rehan@ **and** salman@activeset.co, plus anyone with the `admin: true` claim.
- `RestrictedModule` is defined twice. The copy in `src/shared/contracts` is stale and has no `invoices`.
- Two base-URL env vars (`NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`) are both in use, plus old Railway fallbacks in `review-digest.ts` and `send-notification`.
- Two capture engines have drifted apart: `src/local-capture` and `packages/activeset-capture`.
- The worker's job-kind list and `WORKER_OFFLINE_AFTER_MS` are each defined twice.

## 7. Older docs that are wrong in ways that mislead

Each module doc's *Related docs* section lists the specifics. The worst ones:
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) / [AGENTS.md](../../AGENTS.md): only one admin is listed; the env list is incomplete; they say tokens pass via `x-webflow-token` (they don't: the server resolves them from `project_secrets` using `x-project-id`); `src/app/modules/settings` is not a page.
- [docs/features/proposal.md](../features/proposal.md): names `/api/ai-gen`, `GEMINI_API_KEY` and `proposal_templates`, and describes a Docker/Railway PDF setup. All wrong now.
- [docs/features/audit-dashboard.md](../features/audit-dashboard.md): audits now live in `projects/{id}/link_audits`, not in `links[]`, and scheduled scans exist.
- [docs/features/tasks-clickup.md](../features/tasks-clickup.md) and [docs/features/refrens-skydo-bridge.md](../features/refrens-skydo-bridge.md): describe older behaviour.
- [docs/architecture/modular-monolith.md](../architecture/modular-monolith.md): describes a target layout. About a third of the feature code follows it, and `src/platform` is only re-exports.
