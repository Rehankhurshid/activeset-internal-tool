---
module: index
title: ActiveSet internal tool — module documentation index
keywords: [start here, index, docs, documentation, modules, where is, which file, owner, map, overview]
last_verified: 2026-09-23 @ a00f91e
---
# ActiveSet internal tool: module docs (start here)

> This folder is the authoritative, code-verified map of the app, one file per module. Each doc was written by reading the code at commit `a00f91e` (2026-09-23), and every file path it cites was checked to exist. The older docs in [../features/](../features/), [../plans/](../plans/) and [../architecture/](../architecture/) go deeper on some topics but are partly stale. Each module doc's **Related docs** section says which of them can be trusted.

## How to use these docs (for agents)

1. Find the owning module using the lookup tables below: URL, API path, Firestore collection, cron or keyword.
2. Open that module's doc. Every doc has the same sections, in the same order:
   `Where to find things (quick lookup)` → `User-facing pages` → `API routes` → `Code map` → `Data model` → `Background jobs` → `Configuration` → `External services` → `Key flows` → `Gotchas and invariants` → `Tests` → `Related docs`.
3. Read **Gotchas and invariants** before changing anything.
4. For env vars, use [env-vars.md](./env-vars.md), which covers every variable the code reads.
5. For bugs and security gaps already known, see [known-issues.md](./known-issues.md) so you don't rediscover them.
6. You can grep the docs: each file's frontmatter has `keywords`, `entry_points` and `code_roots`. Example: `grep -l "worker_jobs" docs/modules/*.md`.

If you change code covered by a doc, update that doc in the same change and bump its `last_verified` line.

## Modules

| Doc | What it covers | Main URLs | Code roots |
|---|---|---|---|
| [platform.md](./platform.md) | App shell, nav, ⌘K palette, keyboard shortcuts, Home screen, Google sign-in (`@activeset.co`), admins and module grants, server auth helpers (`requireCaller`, `requireProjectAccess`), Firebase clients, secrets storage, Settings editors, Firestore/Storage rules and indexes, the full cron table, npm scripts, modular-monolith rules, local dev | `/`, `/privacy`, `/modules/proposal/settings` | `src/components/shell`, `src/modules/auth-access`, `src/lib/{firebase,firebase-admin,api-auth,cron-auth}.ts`, `firestore.rules` |
| [env-vars.md](./env-vars.md) | Every environment variable: required or optional, where it is read, which module owns it | — | — |
| [project-links.md](./project-links.md) | **Client Projects**, the hub. Project list, the project detail page and **its tab table** (which module owns each tab), manual links, the `projects` doc (every field), embeddable `widget.js`, legacy audit share link, daily review loop and evening digest | `/modules/project-links`, `/modules/project-links/[id]`, `/embed`, `/share/project-links/[token]` | `src/modules/project-links`, `src/services/database.ts`, `src/types/index.ts` |
| [site-audit.md](./site-audit.md) | How a page gets scanned: sitemap discovery, `scan_jobs` queue, `PageScanner`, link checker, spelling/text checks, Jev judgments, `link_audits`, `audit_logs`, the Audit tab and findings roll-up, `audit_decisions` | `/modules/project-links/[id]?tab=audit`, `/modules/project-links/[id]/audit/[linkId]` | `src/app/api/scan-*`, `src/services/{PageScanner,LinkCheckerService,ScanJobService,AuditService}.ts`, `src/modules/site-monitoring/ui` |
| [site-monitoring.md](./site-monitoring.md) | What happens after scans: change log, anomaly alerts (`site_alerts`), scan-completion notifications, daily health report, email and Slack delivery, screenshot and visual diffs | `/` (alert panels), Audit tab | `src/services/{AlertService,AnomalyDetector,HealthReport*,NotificationService,ScanNotificationQueueService}.ts` |
| [webflow.md](./webflow.md) | Everything that calls the Webflow Data API v2: Pages/SEO editor, bulk SEO and AI SEO, Images (CMS/assets alt), Schema, Sitemap Sync plus drift cron, token storage in `project_secrets`, in-place ALT writes | `/modules/project-links/[id]?tab=webflow` | `src/app/api/webflow/**`, `src/components/webflow`, `src/lib/cms`, `src/lib/webflow-*.ts` |
| [worker-alt-text-images.md](./worker-alt-text-images.md) | The always-on Windows GPU worker, `worker_jobs` and `workers`, every job kind, Ollama ALT drafting (`alt_suggestions`), image weight (`image_budget`), `image_index`, Bunny backups, the CLIs | Audit tab → Alt text / Weight; Webflow tab → Images | `scripts/worker.ts`, `src/lib/worker`, `src/lib/alt-text`, `src/lib/image-budget` |
| [delivery.md](./delivery.md) | Kickoff to handover: the Delivery tab stage rail, page tracker (`projects/{id}/pages`), stacks, Google Sheet sync, launch readiness, **Checklist** tab and SOP templates, **Timeline** tab and templates, Checklist Creator, delivery-nudge cron | `?tab=delivery`, `?tab=checklist`, `?tab=timeline`, `/modules/checklist-creator` | `src/modules/{delivery,timeline,checklists}` |
| [client-portal.md](./client-portal.md) | The client-facing page `/portal/<token>`, the team's Client tab, token mint/rotate/disable (`client_portal_tokens`, sha256-keyed), what the client can and cannot see, approvals, view counting | `/portal/[token]`, `?tab=client` | `src/modules/client-portal`, `src/lib/client-portal*.ts` |
| [proposal.md](./proposal.md) | Proposals and contracts: editor, AI draft/block (Vercel AI Gateway), templates, comments and history, public view and e-signature (`/view/[id]`), PDF generation, view tracking, contract CLI | `/modules/proposal`, `/view/[id]` | `src/app/modules/proposal`, `src/app/api/proposals`, `src/lib/proposal-ai` |
| [clickup-tasks.md](./clickup-tasks.md) | Tasks tab (`tasks`, `requests`), AI parsing of pasted messages, ClickUp list binding, two-way sync and webhooks, refresh cron, Slack nag bot, ClickUp settings | `?tab=tasks`, `/modules/clickup-settings` | `src/components/tasks`, `src/lib/clickup*.ts`, `src/app/api/clickup` |
| [tools-and-extensions.md](./tools-and-extensions.md) | **Invoices / Refrens** (admin tab, `project_invoices`, sync cron, Skydo bridge extension), Chrome extensions and pairing, Internal Tools page, Raycast app, **Screenshot Runner** and `@activeset/capture` package, `/captures/[runId]`, misc scripts | `/modules/internal-tools`, `/modules/screenshot-runner`, `/modules/refrens-settings`, `?tab=invoices`, `/captures/[runId]` | `src/modules/{invoices,internal-tools,screenshot-runner}`, `apps/raycast`, `extensions/`, `packages/activeset-capture` |
| [known-issues.md](./known-issues.md) | Bugs, security gaps, dead code and doc drift found while writing these docs (not fixed) | — | — |

## Lookup: URL → doc

| URL | Doc |
|---|---|
| `/` (Home) | platform (shell, panels); site-monitoring (alert and health panels) |
| `/modules/project-links`, `/modules/project-links/[id]` (shell and tabs) | project-links |
| `?tab=audit`, `/modules/project-links/[id]/audit/[linkId]`, `/pages/[url]` (dead) | site-audit |
| `?tab=delivery`, `?tab=checklist`, `?tab=timeline`, `/modules/project-links/clients/[client]` | delivery (the client-list page itself is in project-links) |
| `?tab=client`, `/portal/[token]` | client-portal |
| `?tab=tasks`, `/modules/clickup-settings` | clickup-tasks |
| `?tab=webflow` | webflow (Images sub-tab drafting → worker-alt-text-images) |
| `?tab=invoices`, `/modules/refrens-settings` | tools-and-extensions |
| `/modules/proposal`, `/view/[id]` | proposal |
| `/modules/proposal/settings` | platform (Settings editors) and proposal (preset content) |
| `/modules/checklist-creator` | delivery |
| `/modules/internal-tools`, `/modules/screenshot-runner`, `/captures/[runId]` | tools-and-extensions |
| `/embed`, `/share/project-links/[token]` | project-links |
| `/privacy` | platform |

## Lookup: API path prefix → doc

| Prefix | Doc |
|---|---|
| `/api/auth/*`, `/api/ping` | platform |
| `/api/project`, `/api/project/[id]`, `/api/projects`, `/api/favicon`, `/api/proxy-image` | project-links (`/api/project/[id]/checklist` → delivery) |
| `/api/scan-sitemap`, `/api/parse-sitemap`, `/api/sitemap-links`, `/api/scan-pages`, `/api/scan-bulk/*`, `/api/save-audit`, `/api/audit`, `/api/audit-logs/*`, `/api/audit-config`, `/api/check-text`, `/api/check-links`, `/api/project-text-check`, `/api/scan-images`, `/api/image-scan/*`, `/api/qa/*` | site-audit |
| `/api/alerts`, `/api/visual-diff`, `/api/compare-screenshots`, `/api/capture-screenshot`, `/api/scan-bulk/notify`, `/api/scan-bulk/debug-notifications` | site-monitoring |
| `/api/webflow/*`, `/api/webflow-settings`, `/api/ai-seo-gen`, `/api/schema/*` | webflow (`/api/webflow/session` is called by the Team Tracker extension, see tools-and-extensions) |
| `/api/delivery/*`, `/api/ai-checklist` | delivery |
| `/api/portal/[token]/*`, `/api/client-portal/[projectId]/*` | client-portal |
| `/api/proposals/*`, `/api/ai/proposal-*`, `/api/generate-pdf`, `/api/send-notification` | proposal |
| `/api/clickup/*`, `/api/tasks/*` | clickup-tasks |
| `/api/refrens/*`, `/api/extension/*`, `/api/raycast/*`, `/api/capture-runs`, `/api/upload-captures` | tools-and-extensions |
| `/api/cron/*` | see the cron table below |

## Lookup: cron → doc

All crons are defined in [vercel.json](../../vercel.json) (times in UTC) and authenticated with `CRON_SECRET` through `isCronAuthorized` ([cron-auth.ts](../../src/lib/cron-auth.ts)). Crons must call back into the app using `NEXT_PUBLIC_BASE_URL`, never the request's Host header (see platform.md, Gotchas).

| Schedule (UTC) | Route | Doc |
|---|---|---|
| `30 0 * * *` | `/api/cron/daily-scan` | site-audit (queues the scan), site-monitoring (alerts after it) |
| `0 1 * * *` | `/api/cron/webflow-sitemap-diff` | webflow |
| `35 3 * * *` | `/api/cron/delivery-nudge` | delivery |
| `0 4 * * *` | `/api/cron/health-report` | site-monitoring |
| `*/5 * * * *` | `/api/cron/scan-jobs` | site-audit (also drains the notification queue → site-monitoring) |
| `0 9 * * *` | `/api/cron/refrens-sync` | tools-and-extensions |
| `*/15 * * * *` | `/api/cron/clickup-refresh` | clickup-tasks |
| `0 14,19 * * 1-5` | `/api/cron/nag-tasks` | clickup-tasks |
| `0 22 * * 1-5` | `/api/cron/review-digest` | project-links |
| **not scheduled** | `/api/cron/cleanup`, `/api/cron/scan-notifications` | site-monitoring (these exist but never run automatically) |

## Lookup: Firestore collection → doc

Collection name constants live in [src/lib/constants.ts](../../src/lib/constants.ts) (`COLLECTIONS`). Rules are in [firestore.rules](../../firestore.rules) and indexes in [firestore.indexes.json](../../firestore.indexes.json).

| Collection | Owning doc |
|---|---|
| `projects` (fields, `links[]` array) | project-links |
| `projects/{id}/link_audits`, `audit_logs`, `scan_jobs`, `projects/{id}/audit_decisions` | site-audit |
| `site_alerts`, `health_reports`, `scan_notifications`, `content_changes` | site-monitoring |
| `project_secrets`, `cmsRuns`, `schemaRuns`, `schema_analyses` (+ `events` subcollections), `webflow_account_history` | webflow |
| `webflow_sessions`, `webflow_pings` | webflow (route) and tools-and-extensions (the Team Tracker extension that writes them) |
| `worker_jobs`, `workers` (+ `control`, `commands`), `projects/{id}/alt_suggestions`, `projects/{id}/image_budget`, `projects/{id}/image_index` | worker-alt-text-images |
| `projects/{id}/pages`, `project_checklists`, `sop_templates`, `project_timelines`, `timeline_templates` | delivery |
| `client_portal_tokens`, `projects/{id}/portal_views` | client-portal |
| `proposals`, `shared_proposals`, `proposal_comments`, `proposal_history`, `proposal_views`, `templates` | proposal |
| `tasks`, `requests`, `app_secrets/clickup` | clickup-tasks |
| `project_invoices`, `app_secrets/refrens`, `capture_runs` | tools-and-extensions |
| `configurations`, `access_control` | platform |

## Lookup: common tasks → doc

| I want to… | Doc |
|---|---|
| Add a nav item or keyboard shortcut | platform |
| Gate a page or API route by login, admin or module grant | platform (`requireCaller`, `requireProjectAccess`, `useModuleAccess`) |
| Add a tab to the project page | project-links (tab table, `tabOptions` in `ProjectDetailScreen.tsx`) |
| Add a new audit check or change scan behaviour | site-audit |
| Add an alert rule or change the Slack/email wording | site-monitoring |
| Change how ALT text is drafted or applied | worker-alt-text-images (drafting), webflow (writing to Webflow) |
| Add a worker job kind | worker-alt-text-images |
| Change a delivery stage, launch check or SOP template | delivery |
| Change what clients see on the portal | client-portal |
| Change proposal AI, PDF or signing | proposal |
| Change ClickUp sync rules | clickup-tasks |
| Change invoices, Raycast, Chrome extensions or screenshot capture | tools-and-extensions |
| Add or rename an env var | env-vars (then the owning doc) |

## Repo-wide facts every agent should know

- **Stack:** Next.js 16 App Router, TypeScript, Tailwind 4 + shadcn/ui, Firebase Auth (Google, `@activeset.co` only) and Firestore, hosted on Vercel. Background work that can't run on Vercel goes to the worker machine.
- **Two code layouts coexist.** Newer features live in `src/modules/<module>/{domain,infrastructure,ui}` with an `index.ts` public API (lint-enforced by `npm run lint:architecture`). Older features live in `src/components`, `src/services` and `src/lib`. Route files under `src/app/**/page.tsx` are thin shells that render a module screen. See platform.md → "Architecture: modular monolith, and how much of the code follows it".
- **Server vs client Firestore.** Server code must use firebase-admin ([firebase-admin.ts](../../src/lib/firebase-admin.ts)). Several legacy routes still use the browser SDK on the server and only work where the rules are open to everyone (see known-issues.md).
- **Checks:** `npm run typecheck`, `npm run arch:check`, `npm test`, `npm run test:rules`. `npm run lint` is broken under Next 16 (see platform.md).
- **Firestore safety:** never delete indexes or data by hand without checking what depends on them (see platform.md → Gotchas, the 2026-09-20 index incident).
