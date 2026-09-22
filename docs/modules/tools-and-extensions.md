---
module: tools-and-extensions
title: Tools, Extensions and Side Apps (Invoices/Refrens, Chrome extensions, Internal Tools, Raycast, Screenshot Runner)
keywords: [invoices, refrens, invoice slots, payment template, import from proposal, generate invoice from tasks, ad-hoc billing, adhoc, billing, ProjectBillingButton, refrens-sync, skydo, refrens-skydo-bridge, invoice bridge, chrome extension, extension pairing, pair with this browser, extension_tokens, webflow settings auditor, webflow team tracker, internal tools, raycast, RAYCAST_API_TOKEN, x-raycast-token, screenshot runner, captures, capture_runs, upload-captures, @activeset/capture, npx @activeset/capture, local-capture, blog-item-generation, well-known workflow]
entry_points: [/modules/internal-tools, /modules/refrens-settings, /modules/project-links/[id]?tab=invoices, /modules/screenshot-runner, /captures/[runId]]
code_roots: [src/modules/invoices, src/modules/internal-tools, src/modules/screenshot-runner, src/app/api/refrens, src/app/api/extension, src/app/api/raycast, src/app/api/upload-captures, src/app/api/capture-runs, extensions/refrens-skydo-bridge, chrome-extension, webflow-team-tracker-1.0.6, apps/raycast, packages/activeset-capture, src/local-capture]
last_verified: 2026-09-23 @ a00f91e
---
# Tools, Extensions and Side Apps

> A grab-bag of the pieces that sit beside the main project dashboard. **Invoices** is an admin-only tab on each project (plus a settings page) that mirrors Refrens invoices into Firestore as planned "slots", syncs their status daily and can create a Refrens invoice from billable ad-hoc tasks. **Chrome extensions** (Refrens → Skydo bridge, Webflow Settings Auditor, Webflow Team Tracker) are shipped as zips from the **Internal Tools** page (`/modules/internal-tools`), which also pairs the first two with the signed-in person via per-person tokens. The **Raycast** app (`apps/raycast`) is a private Raycast extension that talks to a `/api/raycast/*` facade. The **Screenshot Runner** (`/modules/screenshot-runner`) builds a command for the `@activeset/capture` npm CLI, which captures locally with Puppeteer and can upload results to a public share page at `/captures/[runId]`.

## Sub-areas

| # | Sub-area | Main code | Who uses it |
|---|---|---|---|
| 1 | Invoices / Refrens | [src/modules/invoices](../../src/modules/invoices/), [src/services/RefrensService.ts](../../src/services/RefrensService.ts), [src/app/api/refrens](../../src/app/api/refrens/) | Admins only (`rehan@`, `salman@`) |
| 2 | Chrome extensions and pairing | [src/lib/extension-tokens.ts](../../src/lib/extension-tokens.ts), [src/lib/extension-registry.ts](../../src/lib/extension-registry.ts), [src/app/api/extension](../../src/app/api/extension/), [extensions/refrens-skydo-bridge](../../extensions/refrens-skydo-bridge/), [chrome-extension](../../chrome-extension/), [webflow-team-tracker-1.0.6](../../webflow-team-tracker-1.0.6/) | Team members (bridge needs the `invoices` module) |
| 3 | Internal Tools page | [src/modules/internal-tools](../../src/modules/internal-tools/) | Every signed-in team member |
| 4 | Raycast app | [apps/raycast](../../apps/raycast/), [src/app/api/raycast](../../src/app/api/raycast/), [src/lib/raycast-auth.ts](../../src/lib/raycast-auth.ts), [src/lib/raycast-projects.ts](../../src/lib/raycast-projects.ts) | Team members with the shared token |
| 5 | Screenshot Runner and captures | [src/modules/screenshot-runner](../../src/modules/screenshot-runner/), [packages/activeset-capture](../../packages/activeset-capture/), [src/app/api/upload-captures/route.ts](../../src/app/api/upload-captures/route.ts), [src/app/captures/[runId]](../../src/app/captures/[runId]/) | Team (runner page), anyone with a link (share page) |
| 6 | Misc repo-root leftovers | [blog-item-generation](../../blog-item-generation/), a handful of `scripts/`, [skills-lock.json](../../skills-lock.json), `src/app/.well-known/workflow` | See the Misc table under Code map |

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Change how the Refrens JWT is minted or cached | [RefrensService.ts](../../src/services/RefrensService.ts) `mintRefrensJwt`, `getCachedJwt` |
| Change which Refrens query params the Skydo extension may send | [RefrensService.ts](../../src/services/RefrensService.ts) `ALLOWED_QUERY_KEYS`, `PASSTHROUGH_SELECT`, `queryInvoicesForExtension` |
| Change how a Refrens status becomes PAID/UNPAID/OVERDUE | [invoices.repository.ts](../../src/modules/invoices/infrastructure/invoices.repository.ts) `normalizeStatus`, `recomputeOverdueStatus` |
| Change the invoice slot shape | [domain/types.ts](../../src/modules/invoices/domain/types.ts) `ProjectInvoice` |
| Change the Invoices tab UI | [InvoicesTab.tsx](../../src/modules/invoices/ui/components/InvoicesTab.tsx) (mounted by `ProjectDetailScreen`, admin-only) |
| Change "generate invoice from tasks" | UI [GenerateFromTasksCard.tsx](../../src/modules/invoices/ui/components/GenerateFromTasksCard.tsx); server [from-tasks/route.ts](../../src/app/api/refrens/invoices/from-tasks/route.ts); line items [task-billing.ts](../../src/lib/task-billing.ts) `taskToLineItem` |
| Change payment templates (split, monthly, hourly…) | [payment-templates.ts](../../src/lib/payment-templates.ts) `expandToSlots`, `PRESET_TEMPLATE_OPTIONS`; dialog [ApplyTemplateDialog.tsx](../../src/modules/invoices/ui/components/ApplyTemplateDialog.tsx) |
| Change the project billing popover (fixed/retainer/adhoc, rate, country) | [ProjectBillingButton.tsx](../../src/components/projects/ProjectBillingButton.tsx) → `projectsService.updateProjectBilling` in [database.ts](../../src/services/database.ts) |
| Change the daily invoice sync | [cron/refrens-sync/route.ts](../../src/app/api/cron/refrens-sync/route.ts); schedule in [vercel.json](../../vercel.json) |
| Change the invoice status email | [NotificationService.ts](../../src/services/NotificationService.ts) `sendInvoiceStatusEmail`; gate in [invoice-notifications.ts](../../src/modules/invoices/infrastructure/invoice-notifications.ts) `maybeFireInvoiceStatusEmail` |
| Store/rotate Refrens credentials | UI [refrens-settings/page.tsx](../../src/app/modules/refrens-settings/page.tsx); API [refrens/config/route.ts](../../src/app/api/refrens/config/route.ts); storage [appSecrets.ts](../../src/services/appSecrets.ts) |
| Register a new pairable Chrome extension | [extension-registry.ts](../../src/lib/extension-registry.ts) `REGISTERED_EXTENSIONS` + catalogue [tools.ts](../../src/modules/internal-tools/data/tools.ts) + [pack-extension.mjs](../../scripts/pack-extension.mjs) `EXTENSIONS` |
| Change token TTL / verification for extensions | [extension-tokens.ts](../../src/lib/extension-tokens.ts) `EXTENSION_TOKEN_TTL_DAYS`, `requireExtensionToken`, `requireCallerOrExtensionToken` |
| Change the page-to-extension handshake (PING/PAIR/UNPAIR) | Page side [useExtensionPairing.ts](../../src/modules/internal-tools/ui/hooks/useExtensionPairing.ts); extension side `onMessageExternal` in [chrome-extension/background.js](../../chrome-extension/background.js) and [refrens-skydo-bridge/src/background.js](../../extensions/refrens-skydo-bridge/src/background.js) |
| Rebuild the downloadable extension zips | `npm run extension:pack:all` → `public/downloads/*.zip` |
| Add a tool card to Internal Tools | [tools.ts](../../src/modules/internal-tools/data/tools.ts) `TOOLS` |
| Change Raycast auth | [raycast-auth.ts](../../src/lib/raycast-auth.ts) `requireRaycastCaller` |
| Change what Raycast reads/writes in Firestore | [raycast-projects.ts](../../src/lib/raycast-projects.ts) |
| Change a Raycast command | [apps/raycast/src](../../apps/raycast/src/) (`manage-projects.tsx`, `create-task.tsx`, `open-project-link.tsx`, `running-scans.tsx`, HTTP in `api.ts`) |
| Change the Screenshot Runner command builder | [ScreenshotRunnerScreen.tsx](../../src/modules/screenshot-runner/ui/screens/ScreenshotRunnerScreen.tsx) `cliCommand`, `terminalBlock`, `uploadCommand` |
| Change the capture engine that ships to npm | [packages/activeset-capture/src/core/engine.ts](../../packages/activeset-capture/src/core/engine.ts) |
| Change the upload protocol / signature check | Server [upload-captures/route.ts](../../src/app/api/upload-captures/route.ts); client [capture-upload.ts](../../packages/activeset-capture/src/bin/capture-upload.ts); signing [signing.ts](../../packages/activeset-capture/src/core/signing.ts) |
| Change the public capture viewer | [captures/[runId]/page.tsx](../../src/app/captures/[runId]/page.tsx), [CaptureViewer.tsx](../../src/app/captures/[runId]/CaptureViewer.tsx) |
| Publish a new `@activeset/capture` | Bump [package.json](../../packages/activeset-capture/package.json), push tag `capture-v*` → [.github/workflows/publish-activeset-capture.yml](../../.github/workflows/publish-activeset-capture.yml) |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/project-links/[id]?tab=invoices` | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) → [InvoicesTab.tsx](../../src/modules/invoices/ui/components/InvoicesTab.tsx) | Invoice slots for the project; map a Refrens invoice, apply a payment template, import from linked proposal, renewal nudge for `subscription`-tagged projects, "generate from tasks" for `adhoc` projects | Tab only rendered when `useAuth().isAdmin` (hardcoded admin emails or `admin` claim). All backing APIs use `requireAdmin` |
| Project header billing popover | [ProjectBillingButton.tsx](../../src/components/projects/ProjectBillingButton.tsx) | Billing type, hourly rate, currency, bill-to email and country | Rendered only when `isAdmin`; writes via client SDK (`projectsService.updateProjectBilling`) |
| `/modules/refrens-settings` | [refrens-settings/page.tsx](../../src/app/modules/refrens-settings/page.tsx) | Save/delete Refrens `urlKey` + `appId` + EC private key; "Test connection" | Page shows a not-admin state for non-admins; APIs are `requireAdmin`. Linked from the Invoices tab and the command palette ([CommandPalette.tsx](../../src/components/CommandPalette.tsx)) |
| `/modules/internal-tools` | [internal-tools/page.tsx](../../src/app/modules/internal-tools/page.tsx) → [InternalToolsScreen.tsx](../../src/modules/internal-tools/ui/screens/InternalToolsScreen.tsx) | Catalogue of in-app tools and Chrome extensions, download links, setup steps, install detection and "Pair with this browser" | Any signed-in user; the Refrens bridge card is hidden unless `useModuleAccess('invoices')` is true. In the nav ([nav-items.tsx](../../src/components/shell/nav-items.tsx), no `access` key) |
| `/modules/screenshot-runner` | [screenshot-runner/page.tsx](../../src/app/modules/screenshot-runner/page.tsx) → [ScreenshotRunnerScreen.tsx](../../src/modules/screenshot-runner/ui/screens/ScreenshotRunnerScreen.tsx) | URL list builder (paste or fetch sitemap via `/api/sitemap-links`), device/format/warmup options, generated `npx @activeset/capture run …` block and `upload` command | Signed-in user (screen shows sign-in when `!user`); nav `access: 'project-links'`, which is open to everyone |
| `/captures/[runId]` | [captures/[runId]/page.tsx](../../src/app/captures/[runId]/page.tsx) + [CaptureViewer.tsx](../../src/app/captures/[runId]/CaptureViewer.tsx) | Server-rendered gallery of an uploaded capture run (desktop/mobile, lightbox, per-image download) | **Public**, no auth: reads `capture_runs/{runId}` with firebase-admin |
| `/downloads/*.zip` | [public/downloads](../../public/downloads/) | Static extension zips | Public static files |

## API routes

Auth legend: **Admin** = `requireAdmin` in [api-auth.ts](../../src/lib/api-auth.ts) (Firebase ID token, `@activeset.co`, email in `ADMIN_EMAILS` or `admin` claim). **Module(x)** = `requireModule`. **Ext token** = `requireExtensionToken`. **Raycast** = `requireRaycastCaller` (Firebase ID token, or shared `RAYCAST_API_TOKEN`).

### Invoices / Refrens

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| GET | `/api/refrens/config` | [config/route.ts](../../src/app/api/refrens/config/route.ts) | Admin | `{configured, urlKey, appId, updatedAt}`; never the key |
| POST | `/api/refrens/config` | same | Admin | Save `urlKey`, `appId`, PEM `privateKey`; invalidates JWT + list caches |
| DELETE | `/api/refrens/config` | same | Admin | Delete `app_secrets/refrens` |
| GET | `/api/refrens/test` | [test/route.ts](../../src/app/api/refrens/test/route.ts) | Admin | Lists 1 invoice to prove credentials work |
| GET | `/api/refrens/invoices?projectId=` | [invoices/route.ts](../../src/app/api/refrens/invoices/route.ts) | Admin | Mirror rows for a project, sorted by `order` then date |
| POST | `/api/refrens/invoices/slot` | [slot/route.ts](../../src/app/api/refrens/invoices/slot/route.ts) | Admin | Create one empty `PENDING` slot |
| POST | `/api/refrens/invoices/template` | [template/route.ts](../../src/app/api/refrens/invoices/template/route.ts) | Admin | `expandToSlots` → N slots appended (also used by "Import from proposal" and the renewal nudge) |
| GET | `/api/refrens/invoices/available?projectId=&refresh=1` | [available/route.ts](../../src/app/api/refrens/invoices/available/route.ts) | Admin | Up to 500 Refrens invoices (10-min in-memory cache) annotated `unmapped` / `mapped-current` / `mapped-other` |
| POST | `/api/refrens/invoices/map` | [map/route.ts](../../src/app/api/refrens/invoices/map/route.ts) | Admin | Attach a Refrens invoice to a slot (`slotId`) or as an ad-hoc row; 409 if mapped elsewhere |
| POST | `/api/refrens/invoices/from-tasks` | [from-tasks/route.ts](../../src/app/api/refrens/invoices/from-tasks/route.ts) | Admin | **Creates a real Refrens invoice** from billable tasks, mirrors it, stamps tasks invoiced |
| POST | `/api/refrens/invoices/link-tasks` | [link-tasks/route.ts](../../src/app/api/refrens/invoices/link-tasks/route.ts) | Admin | Stamp tasks against an existing mirror row; no Refrens write |
| PATCH | `/api/refrens/invoices/[id]` | [[id]/route.ts](../../src/app/api/refrens/invoices/[id]/route.ts) | Admin | Edit slot planning fields and `emailNotifyEnabled` |
| DELETE | `/api/refrens/invoices/[id]` | same | Admin | Delete the mirror row only (Refrens untouched) |
| POST | `/api/refrens/invoices/[id]?action=sync\|recompute\|unmap` | same | Admin | Refresh from Refrens / local overdue recompute / clear Refrens fields |
| GET, POST | `/api/cron/refrens-sync` | [cron/refrens-sync/route.ts](../../src/app/api/cron/refrens-sync/route.ts) | Cron secret (`isCronAuthorized`, [cron-auth.ts](../../src/lib/cron-auth.ts)) | Daily sync of all non-terminal mirror rows (POST just calls GET) |

### Extension pairing and proxy

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| POST | `/api/extension/pair` `{slug}` | [pair/route.ts](../../src/app/api/extension/pair/route.ts) | Module(extension.module) | Issue a per-person token; returns `{token, extensionId, apiBase, urlKey, pairedAs}`. `urlKey` only for `invoices`-module extensions |
| DELETE | `/api/extension/pair?slug=` | same | Module(extension.module) | Revoke the caller's own tokens for that extension |
| DELETE | `/api/extension/pair?slug=&email=` | same | Admin | Revoke someone else's tokens |
| GET | `/api/extension/refrens/invoices?<feathers query>` | [extension/refrens/invoices/route.ts](../../src/app/api/extension/refrens/invoices/route.ts) | Ext token (`refrens-skydo-bridge`) | Allowlisted, read-only invoice query with forced `$select`, `$limit` ≤ 50 |
| GET | `/api/extension/refrens/invoices/[id]` | [extension/refrens/invoices/[id]/route.ts](../../src/app/api/extension/refrens/invoices/[id]/route.ts) | Ext token (`refrens-skydo-bridge`) | Full invoice doc (for `share.link`); id must match `/^[a-f0-9]{24}$/i` |

Also accepting the Webflow Settings Auditor's token (owned by other module docs): `GET /api/projects` ([route.ts](../../src/app/api/projects/route.ts)) and `GET|POST /api/webflow-settings` ([route.ts](../../src/app/api/webflow-settings/route.ts)) via `requireCallerOrExtensionToken(req, 'webflow-settings-auditor')`. The Team Tracker extension uses `GET|POST /api/webflow/session` ([route.ts](../../src/app/api/webflow/session/route.ts)), which has no auth; see the Webflow module doc.

### Raycast facade

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| GET | `/api/raycast/me` | [me/route.ts](../../src/app/api/raycast/me/route.ts) | Raycast | Connection check / who am I |
| GET | `/api/raycast/projects?includeLinks=true` | [projects/route.ts](../../src/app/api/raycast/projects/route.ts) | Raycast | All projects, serialized |
| POST | `/api/raycast/projects` | same | Raycast | Create project |
| GET, PATCH, DELETE | `/api/raycast/projects/[projectId]` | [[projectId]/route.ts](../../src/app/api/raycast/projects/[projectId]/route.ts) | Raycast + project exists | Read / edit (name, client, status, tags, sitemapUrl) / delete project doc |
| POST | `/api/raycast/projects/[projectId]/review` `{reviewed}` | [review/route.ts](../../src/app/api/raycast/projects/[projectId]/review/route.ts) | same | Mark reviewed today (streak) or clear |
| GET, POST | `/api/raycast/projects/[projectId]/links` | [links/route.ts](../../src/app/api/raycast/projects/[projectId]/links/route.ts) | same | Read / add a link in `project.links` |
| PATCH, DELETE | `/api/raycast/projects/[projectId]/links/[linkId]` | [links/[linkId]/route.ts](../../src/app/api/raycast/projects/[projectId]/links/[linkId]/route.ts) | same | Edit / remove a link |
| GET, POST | `/api/raycast/projects/[projectId]/tasks` | [tasks/route.ts](../../src/app/api/raycast/projects/[projectId]/tasks/route.ts) | same | List / create task, then `syncCreatedTasksToClickUp` |
| PATCH, DELETE | `/api/raycast/projects/[projectId]/tasks/[taskId]` | [tasks/[taskId]/route.ts](../../src/app/api/raycast/projects/[projectId]/tasks/[taskId]/route.ts) | same | Edit / delete task (not called by the Raycast app today) |
| GET, POST | `/api/raycast/projects/[projectId]/scans` | [scans/route.ts](../../src/app/api/raycast/projects/[projectId]/scans/route.ts) | same | Active scan jobs for project / start a bulk scan by calling the `/api/scan-bulk` handler in-process |
| GET | `/api/raycast/scans/running` | [scans/running/route.ts](../../src/app/api/raycast/scans/running/route.ts) | Raycast | All active scan jobs with % |
| GET | `/api/raycast/assignees` | [assignees/route.ts](../../src/app/api/raycast/assignees/route.ts) | Raycast | ClickUp team member emails (team id from `app_secrets/clickup.teamId`, then `CLICKUP_TEAM_ID`, then first team) |

### Captures

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| OPTIONS | `/api/upload-captures` | [upload-captures/route.ts](../../src/app/api/upload-captures/route.ts) | none (CORS `*`) | Preflight |
| POST | `/api/upload-captures` | same | `init`: HMAC of manifest (see Gotchas). `file`, `finalize`: **none**, only a known `runId` | Chunked upload: `init` (JSON) creates `capture_runs/{runId}`; `file` (multipart, one image) saves to Storage and `arrayUnion`s the doc; `finalize` sets `status: complete` and returns `shareUrl` |
| GET | `/api/capture-runs?projectName=` | [capture-runs/route.ts](../../src/app/api/capture-runs/route.ts) | **none** | Fuzzy name match over all complete runs (max 50). Called by the project Image Library ([ImageLibrary.tsx](../../src/modules/project-links/ui/components/ImageLibrary.tsx)) |

## Code map

### 1. Invoices / Refrens

**Module dir [src/modules/invoices](../../src/modules/invoices/)**
- [index.ts](../../src/modules/invoices/index.ts): exports `InvoicesTab` and the `ProjectInvoice` / `InvoiceStatus` types.
- [domain/types.ts](../../src/modules/invoices/domain/types.ts): `ProjectInvoice` (slot fields + Refrens mirror fields + `emailNotifyEnabled` + bookkeeping), `InvoiceStatus` (`PENDING | UNPAID | PAID | OVERDUE | CANCELED | UNKNOWN`), `CreateSlotInput`, `UpdateSlotInput`. Doc comment explains the three row states: empty slot, filled slot, ad-hoc.
- [infrastructure/invoices.repository.ts](../../src/modules/invoices/infrastructure/invoices.repository.ts) (server-only, firebase-admin): `createSlot`, `createSlotsBatch`, `updateSlotFields`, `deleteSlot`, `unmapSlot`, `fillSlotWithRefrens`, `upsertInvoiceFromRefrens` (idempotent on `projectId + refrensInvoiceId`), `listInvoicesForProject`, `listAllInvoices`, `getInvoiceById`, `findInvoiceByRefrensId`, `setInvoiceNotifyEnabled`, `recomputeOverdueStatus`; `SyncResult` type.
- [infrastructure/adhoc-invoicing.repository.ts](../../src/modules/invoices/infrastructure/adhoc-invoicing.repository.ts) (server-only): `getBillingProject`, `getTasksByIds`, `markTasksInvoiced` (batch merge of `invoiceId`, `invoiceNumber`, `invoicedAt` onto `tasks/*`).
- [infrastructure/invoice-notifications.ts](../../src/modules/invoices/infrastructure/invoice-notifications.ts): `getProjectNameForInvoice`, `maybeFireInvoiceStatusEmail` (only when `statusChanged && emailNotifyEnabled`; swallows errors).
- UI [ui/components](../../src/modules/invoices/ui/components/):
  - `InvoicesTab.tsx`: loads config then rows, proposal link banner + "Import from proposal" (uses `proposal.data.paymentTerms`), subscription renewal nudge (last dated slot ≤ 30 days away → prefilled 3-month template), mounts the dialogs below and `GenerateFromTasksCard` when `billingType === 'adhoc'`.
  - `SlotCard.tsx`: one row; sync/recompute/unmap actions, notify toggle (PATCH), delete.
  - `SlotDialog.tsx`: create (POST `/slot`) or edit (PATCH `/[id]`) planning fields.
  - `MapInvoiceDialog.tsx`: picker over `/available`, POST `/map`.
  - `ApplyTemplateDialog.tsx`: preset/custom payment template → POST `/template`.
  - `LinkProposalDialog.tsx`: sets `project.proposalId` via `projectLinksRepository` (client SDK), reading proposals through `ProposalService`.
  - `GenerateFromTasksCard.tsx`: `useProjectTasks(projectId)` → billable, un-invoiced tasks; POST `/from-tasks` (optionally cloning bill-to from a past invoice) or `/link-tasks`.

**Service** [src/services/RefrensService.ts](../../src/services/RefrensService.ts) (server-only): ES256 JWT mint + in-memory cache; `listInvoices`, `listAllInvoicesCached` (page 1, then parallel pages of 50, cap 500, 10-min TTL keyed on appId), `createInvoice`, `getInvoice`, extension passthroughs `queryInvoicesForExtension`, `getInvoiceRawForExtension`, `getRefrensUrlKey`; errors `RefrensApiError`, `RefrensNotConfiguredError`; `invalidateRefrensJwtCache`, `invalidateInvoiceListCache`.

**Other service/lib**
- [src/services/appSecrets.ts](../../src/services/appSecrets.ts): `getRefrensCredentials`, `setRefrensCredentials`, `deleteRefrensCredentials`, `getRefrensConfigStatus` on `app_secrets/refrens`.
- [src/lib/payment-templates.ts](../../src/lib/payment-templates.ts): `PaymentTemplate` union (`one-time`, `split`, `monthly`, `quarterly`, `hourly`, `custom`), `expandToSlots`, `PRESET_TEMPLATE_OPTIONS`, `describeTemplate`, date helpers.
- [src/lib/task-billing.ts](../../src/lib/task-billing.ts): `taskToLineItem`, `resolveTaskBillingMode`, `taskBillAmount`.
- [src/lib/api-client.ts](../../src/lib/api-client.ts): `fetchAuthed` (attaches the Firebase ID token) used by all invoice UI.
- [src/components/projects/ProjectBillingButton.tsx](../../src/components/projects/ProjectBillingButton.tsx): header popover.
- Types in [src/types/index.ts](../../src/types/index.ts): `BillingType`, `normalizeBillingType`, `BILLING_TYPE_LABELS`, project billing fields (`billingType`, `hourlyRate`, `billingCurrency`, `billingContactEmail`, `billingCountry`, `proposalId`), task billing fields (`billable`, `billingMode`, `billedHours`, `billedRate`, `billedAmount`, `invoiceId`, `invoiceNumber`, `invoicedAt`).

### 2. Chrome extensions and pairing

**Server lib**
- [src/lib/extension-registry.ts](../../src/lib/extension-registry.ts): `REGISTERED_EXTENSIONS` (pinned id, slug, name, required module) and `getExtensionBySlug`. Two entries: `refrens-skydo-bridge` (`invoices`) and `webflow-settings-auditor` (`project-links`).
- [src/lib/extension-tokens.ts](../../src/lib/extension-tokens.ts): `issueExtensionToken` (revokes old, 32 random bytes base64url, stores sha256 as doc id, 180-day `expiresAt`), `revokeExtensionTokens`, `requireExtensionToken`, `extensionAuthErrorResponse`, `requireCallerOrExtensionToken`, `ExtensionTokenRecord`.
- [src/lib/module-access.ts](../../src/lib/module-access.ts): server `hasModuleAccess` (reads `access_control/module_access`; `project-links` always true).

**The three extension folders**

| Folder | Manifest name / version | Pinned id (`key`) | Talks to | Status |
|---|---|---|---|---|
| [extensions/refrens-skydo-bridge](../../extensions/refrens-skydo-bridge/) | "Refrens → Skydo Invoice Bridge" 3.0.0 | yes, `lndfjmgghbhchfhffhniencmffdpmnfp` | `/api/extension/refrens/invoices*`; Skydo's `/api/funding-invoice-mapping` with user cookies | Live; PDF capture flagged broken in the catalogue |
| [chrome-extension](../../chrome-extension/) | "Webflow Settings Auditor" 2.1.0 (side panel) | yes, `fcggeinimgcpbpplnopegodlbapkmcnp` | `/api/projects`, `/api/webflow-settings` with the pairing token | Live |
| [webflow-team-tracker-1.0.6](../../webflow-team-tracker-1.0.6/) | "Webflow Team Tracker" 1.0.6 (popup + content script) | no | `https://app.activeset.co/api/webflow/session` (hardcoded) | Live, unauthenticated |

Bridge source files ([src](../../extensions/refrens-skydo-bridge/src/)): `background.js` (service worker, message router, external PING/PAIR/UNPAIR from allowlisted origins), `refrens-api.js` (pairing storage, `apiGet` against the app, the four parallel match probes, browse), `match.js` (scoring and reasons), `capture.js` (`share.link` in hidden tab → `Page.printToPDF` via `chrome.debugger`), `skydo-panel.js/.css` (content script on `dashboard.skydo.com`), `popup.*`, `options.*` (unpair + "prefer hosted PDF" toggle), `shared.css`. Tests in [test](../../extensions/refrens-skydo-bridge/test/).

Copies of the team tracker: [webflow-team-tracker-1.0.6](../../webflow-team-tracker-1.0.6/) is the source the pack script uses; [public/webflow-tracker](../../public/webflow-tracker/) is a byte-identical copy served as raw static files (the older feature doc points here); [webflow-team-tracker-1.0.6.zip](../../webflow-team-tracker-1.0.6.zip) at the repo root is an older flat-layout zip of the same files; [public/downloads/webflow-team-tracker-1.0.6.zip](../../public/downloads/webflow-team-tracker-1.0.6.zip) is what Internal Tools links to.

**Script** [scripts/pack-extension.mjs](../../scripts/pack-extension.mjs): zips an extension folder into `public/downloads/<slugified manifest name>-<version>.zip`; `--all` packs the three folders in its `EXTENSIONS` array. npm: `extension:pack`, `extension:pack:all`.

### 3. Internal Tools

- [src/modules/internal-tools/index.ts](../../src/modules/internal-tools/index.ts): exports screen, catalogue, hook.
- [data/tools.ts](../../src/modules/internal-tools/data/tools.ts): `TOOLS` (4 entries: Screenshot Runner module, 3 extensions), `Tool` type, `visibleTools(kind, grants)` (hides tools whose `requiresModule` the viewer lacks).
- [ui/screens/InternalToolsScreen.tsx](../../src/modules/internal-tools/ui/screens/InternalToolsScreen.tsx): two sections; `PairingStrip` per extension with `extensionId`/`pairingSlug`; grants from `useModuleAccess('invoices')`.
- [ui/hooks/useExtensionPairing.ts](../../src/modules/internal-tools/ui/hooks/useExtensionPairing.ts): `chrome.runtime.sendMessage(extensionId, {type:'PING'|'PAIR'|'UNPAIR'})` + `/api/extension/pair`. States `checking | not-installed | installed | paired | error`.
- Page wrapper [src/app/modules/internal-tools/page.tsx](../../src/app/modules/internal-tools/page.tsx).

### 4. Raycast

- [apps/raycast/package.json](../../apps/raycast/package.json): Raycast manifest `activeset-projects` v0.1.0; 4 commands; preferences `baseUrl` (default `https://app.activeset.co`), `apiToken` (password), `userEmail`. Separate npm project (`ray develop|build|lint`), not part of the Next build.
- [apps/raycast/src/api.ts](../../apps/raycast/src/api.ts): all HTTP; sends `Authorization: Bearer <apiToken>` and `x-activeset-user-email`.
- `manage-projects.tsx`, `project-components.tsx` (project detail/actions/forms), `create-task.tsx` (5-line wrapper), `open-project-link.tsx`, `running-scans.tsx`, `types.ts` in [apps/raycast/src](../../apps/raycast/src/).
- [src/lib/raycast-auth.ts](../../src/lib/raycast-auth.ts): `requireRaycastCaller`, `requireRaycastProjectAccess`.
- [src/lib/raycast-projects.ts](../../src/lib/raycast-projects.ts) (server-only, firebase-admin): project load/serialize (merges `projects/{id}/link_audits`), create/update/delete, link array writes (`writeRaycastProjectLinks` strips audit results), `setRaycastProjectReviewed` (uses `nextStreak` from `review-status`), task load/create/update/delete with enum validation.

### 5. Screenshot Runner and captures

- [src/modules/screenshot-runner/index.ts](../../src/modules/screenshot-runner/index.ts) → [ScreenshotRunnerScreen.tsx](../../src/modules/screenshot-runner/ui/screens/ScreenshotRunnerScreen.tsx): no capture happens in the app. It dedupes URLs, optionally fetches a sitemap, and renders a copyable heredoc + `npx @activeset/capture run --project … --file … --out … --devices … --format … [--warmup off] [--upload <origin>]`, plus an upload command for an existing run folder (drag-drop a `manifest.json` to prefill).
- [src/app/api/upload-captures/route.ts](../../src/app/api/upload-captures/route.ts): the three-phase upload, HMAC `verifySignature`, `getBucket()` (default Firebase Storage bucket), public object URLs.
- [src/app/api/capture-runs/route.ts](../../src/app/api/capture-runs/route.ts): run search by project name.
- [src/app/captures/[runId]/page.tsx](../../src/app/captures/[runId]/page.tsx) (RSC, firebase-admin) + [CaptureViewer.tsx](../../src/app/captures/[runId]/CaptureViewer.tsx) (client gallery).
- **npm package** [packages/activeset-capture](../../packages/activeset-capture/) (`@activeset/capture` 0.4.3 in repo): `src/bin/activeset-capture.ts` (dispatcher: wizard / `run` / `upload`), `capture-wizard.ts`, `capture-local.ts` (`--sitemap`, `--urls`, `--file`, stdin), `capture-upload.ts`; `src/core/engine.ts` (Puppeteer + stealth, default concurrency 6), `warmup-scroll.ts`, `io.ts`, `manifest.ts` (run id `<slug>-<timestamp>`), `signing.ts` (`signManifest`), `types.ts`. Committed build output in `dist/` and two stale tarballs (`activeset-capture-0.1.0.tgz`, `-0.1.3.tgz`).
- **In-repo fork** [src/local-capture](../../src/local-capture/): older copy of the core (no `signing.ts`, default concurrency 3; `engine.ts`, `types.ts`, `warmup-scroll.ts` differ from the package; `io.ts`, `manifest.ts` identical). Only used by [scripts/capture-local.ts](../../scripts/capture-local.ts) (`npm run capture:local`). [scripts/capture-wizard.ts](../../scripts/capture-wizard.ts) (`npm run capture:wizard`) instead imports the package source directly.
- Root npm scripts: `capture:pkg:build`, `capture:pkg:pack`, `test:local-capture`.

### 6. Misc (live or dead)

| Item | What it is | Live? |
|---|---|---|
| [blog-item-generation/](../../blog-item-generation/) | Hand-run blog content pipeline for activeset.co (notes in `CONTENT-PIPELINE.md` with Webflow site/collection ids, `url-to-md.mjs` URL→markdown batch converter, scraped Client-First docs, 4 generated post JSONs, a `seo-engine-v2.jsx` and an embed snippet). Not imported by the app | Dormant; last touched 2026-04-04 (`b69d1b9`) |
| [scripts/check-gemini-models.ts](../../scripts/check-gemini-models.ts) | Lists Gemini models using `GEMINI_API_KEY` parsed from `.env.local` | One-off dev probe, dead (2025-12) |
| [scripts/test-google-genai.ts](../../scripts/test-google-genai.ts) | Smoke test of the Google GenAI SDK with the same key | One-off, dead (2025-12) |
| [scripts/test-local-api.ts](../../scripts/test-local-api.ts) | POSTs to `http://localhost:3000/api/ai-gen` | Dead: `src/app/api/ai-gen` no longer exists |
| [scripts/debug-scan.ts](../../scripts/debug-scan.ts) | Fetches a URL twice with cheerio and compares content hashes (scan-stability debugging) | One-off (2026-01) |
| [scripts/reproduce-scan.ts](../../scripts/reproduce-scan.ts) | Runs `pageScanner` 5× against an activeset.co page and writes `scripts/scan-output.html` (that file is committed) | One-off (2026-01); still imports a live service |
| [scripts/verify-ui.ts](../../scripts/verify-ui.ts) | Static checks over UI files; wired to `verify:ui` / `verify:ui:staged` (no git hook calls it) | Stale (2025-09) |
| [skills-lock.json](../../skills-lock.json) | Lock file for an agent skill (`emil-design-eng` from GitHub `emilkowalski/skill`), materialised in `.agents/skills/` | Agent tooling, not app code |
| `src/app/.well-known/workflow/v1/*` | Generated by the Vercel Workflow DevKit (`withWorkflow` in [next.config.ts](../../next.config.ts), package `workflow`) for [src/workflows/image-scan.ts](../../src/workflows/image-scan.ts). Its own `.gitignore` is `*`, so nothing there is tracked | Live, generated; do not edit |
| [packages/captures/](../../packages/captures/) | Seven committed sample capture runs from 2026-04-07 (~980 tracked files, webp + manifests) | Dead weight |
| `packages/*-urls.txt`, `packages/activeset-capture/*-urls.txt` | URL lists for past client capture runs | Dead weight |

## Data model

| Path | One document = | Key fields (type, file) | Writers | Readers | SDK |
|---|---|---|---|---|---|
| `project_invoices/{autoId}` (`COLLECTIONS.PROJECT_INVOICES`, [constants.ts](../../src/lib/constants.ts)) | One invoice slot or mirrored Refrens invoice for one project | `ProjectInvoice` in [domain/types.ts](../../src/modules/invoices/domain/types.ts): `projectId`, `label`, `expectedAmount/Currency/DueDate`, `notes`, `order`, `refrensInvoiceId`, `refrensUrlKey`, `invoiceNumber`, `status`, `lastKnownStatus`, `amount`, `currency`, `invoiceDate`, `dueDate`, `shareLink`, `pdfLink`, `billedToName/Email`, `emailNotifyEnabled`, `lastSyncedAt`, ISO string `createdAt/updatedAt` | `/api/refrens/*`, refrens-sync cron | same | firebase-admin only |
| `app_secrets/refrens` (`COLLECTIONS.APP_SECRETS`) | Refrens credentials for the whole app | `urlKey`, `appId`, `privateKey` (PEM EC), `updatedAt` ([appSecrets.ts](../../src/services/appSecrets.ts)) | `POST /api/refrens/config` | `RefrensService` | firebase-admin only |
| `app_secrets/clickup` | ClickUp config (owned by ClickUp doc) | `teamId` read here | ClickUp settings | `/api/raycast/assignees` | firebase-admin |
| `extension_tokens/{sha256(token)}` (literal in [extension-tokens.ts](../../src/lib/extension-tokens.ts)) | One paired browser for one person and one extension | `ExtensionTokenRecord`: `uid`, `email` (lowercased), `extension` (slug), `module`, `createdAt`, `expiresAt?`, `lastUsedAt?` | `/api/extension/pair` | `requireExtensionToken` | firebase-admin only |
| `capture_runs/{runId}` (literal in the capture routes) | One uploaded capture run | `runId`, `projectName`, `createdAt` (ISO), `status` (`uploading`/`complete`), `screenshotCount`, `expectedCount`, `screenshots[]` `{device, fileName, url, originalUrl}`, `summary`, `settings` (inline types in [upload-captures/route.ts](../../src/app/api/upload-captures/route.ts) and [captures/[runId]/page.tsx](../../src/app/captures/[runId]/page.tsx)) | `/api/upload-captures` | `/captures/[runId]`, `/api/capture-runs` | firebase-admin only |
| `projects/{id}` | Project (owned by project-links doc) | Billing fields written by `ProjectBillingButton` (client SDK); Raycast writes `name`, `client`, `status`, `tags`, `sitemapUrl`, `links[]`, review fields (`lastReviewDate`, `lastReviewedAt`, `lastReviewedBy`, `reviewStreak`) | UI, Raycast | many | both |
| `projects/{id}/link_audits` | Per-link audit result (owned elsewhere) | merged into links for Raycast | scanner | `raycast-projects.ts` | firebase-admin |
| `tasks/{id}` (`COLLECTIONS.TASKS`) | Task (owned by tasks doc) | Invoicing stamps `invoiceId`, `invoiceNumber`, `invoicedAt`; Raycast creates/edits tasks | `markTasksInvoiced`, Raycast | Invoices UI via `useProjectTasks` | both |
| `access_control/module_access` | Module grants (owned by settings doc) | `modules.invoices[]` gates the bridge | Settings → Team Access | `hasModuleAccess` | both |
| `webflow_sessions`, `webflow_pings` | Team Tracker presence (owned by Webflow doc) | | `/api/webflow/session` | tracker popup | rules `allow read, write: if true` |

**firestore.rules**: `project_invoices`, `app_secrets`, `extension_tokens` and `capture_runs` are not matched anywhere, so client SDK access is denied by default ([firestore.rules](../../firestore.rules) lines 23-29 name the first three explicitly). **firestore.indexes.json**: no entries for these collections; the two-field equality queries (`projectId + refrensInvoiceId`, `email + extension`) run on automatic single-field indexes.

**Storage**: capture images at `captures/{runId}/{device}/{fileName}` in the default bucket, saved with `public: true` and served as `https://storage.googleapis.com/<bucket>/captures/...`. [storage.rules](../../storage.rules) only allows `screenshots/**`; the capture path is written with firebase-admin (bypasses rules) and read through the public object ACL, not the rules.

## Background jobs

| Schedule (UTC) | Route | What it does | Auth |
|---|---|---|---|
| `0 9 * * *` ([vercel.json](../../vercel.json)) | `/api/cron/refrens-sync` | For every `project_invoices` row not `PAID`/`CANCELED`/`PENDING` and with a Refrens id: `getInvoice` → `upsertInvoiceFromRefrens`; on `RefrensApiError`/`RefrensNotConfiguredError` falls back to `recomputeOverdueStatus`. Emails on status change when the row opted in. Returns a summary. `maxDuration = 300`, sequential loop | `CRON_SECRET` bearer or `x-cron-secret`; fail-closed in production |

No worker jobs, queues or webhooks in this area. The Workflow DevKit endpoints under `.well-known/workflow` belong to the image-scan workflow (other doc).

## Configuration

| Env var | Required? | Used in |
|---|---|---|
| `REFRENS_API_BASE_URL` | No (default `https://api.refrens.com`) | [RefrensService.ts](../../src/services/RefrensService.ts) `getBaseUrl` |
| `NEXT_PUBLIC_APP_URL` | No (falls back to request origin) | Project link in invoice emails: [refrens-sync](../../src/app/api/cron/refrens-sync/route.ts), [[id]/route.ts](../../src/app/api/refrens/invoices/[id]/route.ts) |
| `CRON_SECRET` | Yes in production | [cron-auth.ts](../../src/lib/cron-auth.ts) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` | For invoice emails (silently `skipped` if any missing) | [NotificationService.ts](../../src/services/NotificationService.ts) `getEmailConfig` |
| `RAYCAST_API_TOKEN` | For shared-token Raycast access (without it only Firebase tokens work) | [raycast-auth.ts](../../src/lib/raycast-auth.ts) |
| `CLICKUP_TEAM_ID` | No (fallback for assignees) | [raycast/assignees/route.ts](../../src/app/api/raycast/assignees/route.ts) |
| `ACTIVESET_UPLOAD_KEY` | No (default `activeset-capture-v1`); must match on CLI machine and server | [upload-captures/route.ts](../../src/app/api/upload-captures/route.ts), [signing.ts](../../packages/activeset-capture/src/core/signing.ts) |
| `NEXT_PUBLIC_BASE_URL` | No (default `https://app.activeset.co`) | `shareUrl` in upload finalize |
| `NPM_TOKEN` (GitHub secret) | For publishing `@activeset/capture` | [publish-activeset-capture.yml](../../.github/workflows/publish-activeset-capture.yml) |

Stored config: `app_secrets/refrens` (Refrens credentials), `access_control/module_access.modules.invoices` (bridge access). Raycast preferences (`baseUrl`, `apiToken`, `userEmail`) live in each person's Raycast. Extension pairing state lives in `chrome.storage.local` (`extToken`, `apiBase`, `refrensUrlKey`, `pairedAs`, `pairedAt`). No feature flags.

## External services

| Service | Called from | Auth |
|---|---|---|
| Refrens REST API (`/businesses/{urlKey}/invoices[...]`) | [RefrensService.ts](../../src/services/RefrensService.ts) `refrensFetch` | `Authorization: Bearer <ES256 JWT>` minted from `app_secrets/refrens` (`iss/sub = appId`, `aud: 'serana'`, 1 h TTL, refreshed 60 s early) |
| Gmail SMTP (nodemailer) | `sendInvoiceStatusEmail` | Gmail app password |
| Skydo dashboard API (`/api/funding-invoice-mapping`) | Bridge content script [skydo-panel.js](../../extensions/refrens-skydo-bridge/src/skydo-panel.js) | The user's Skydo cookies, same-origin |
| Refrens `share.link` pages | Bridge [capture.js](../../extensions/refrens-skydo-bridge/src/capture.js) | Token embedded in the link; printed via `chrome.debugger` `Page.printToPDF` |
| ClickUp API | [raycast/assignees](../../src/app/api/raycast/assignees/route.ts) (`fetchTeamMembers`, `listTeams`), Raycast task create (`syncCreatedTasksToClickUp`) | ClickUp token (see ClickUp doc) |
| Firebase Storage | [upload-captures/route.ts](../../src/app/api/upload-captures/route.ts) | firebase-admin |
| npm registry | GitHub Actions publish | `NPM_TOKEN`, provenance |
| Puppeteer / Chrome (local) | `@activeset/capture` engine on the user's machine | n/a |

## Key flows

1. **Plan and fill invoice slots.** Admin opens the Invoices tab → `InvoicesTab` GETs `/api/refrens/config` then `/api/refrens/invoices`. "Apply template" (`ApplyTemplateDialog`) or "Import from proposal" POSTs `/api/refrens/invoices/template` → `expandToSlots` → `createSlotsBatch` (appended `order`). The invoice is raised in Refrens by hand; "Map" (`MapInvoiceDialog`) lists `/available` (cached Refrens list + fresh mapping state) and POSTs `/map` → collision check `findInvoiceByRefrensId` → `getInvoice` → `fillSlotWithRefrens` (keeps planning fields) or `upsertInvoiceFromRefrens` (ad-hoc row).
2. **Daily status sync and email.** Vercel cron → `refrens-sync` GET → `isCronAuthorized` → `listAllInvoices` → per row `getInvoice` + `upsertInvoiceFromRefrens` (sets `lastKnownStatus = prev.status`) → `normalizeStatus` turns `UNPAID` past `dueDate` into `OVERDUE` → if changed and `emailNotifyEnabled`, `maybeFireInvoiceStatusEmail` → `sendInvoiceStatusEmail` to `NOTIFY_EMAIL`. The same path runs on demand from `SlotCard` via `POST /api/refrens/invoices/[id]?action=sync`.
3. **Ad-hoc tasks to a Refrens invoice.** Admin sets billing type `adhoc` + rate/currency/country in `ProjectBillingButton` (client SDK `updateProjectBilling`) → `GenerateFromTasksCard` lists `billable && !invoiceId` tasks → POST `/api/refrens/invoices/from-tasks` → validates all tasks (same project, billable, not invoiced, resolvable rate via `taskToLineItem`) → bill-to from optional `copyFromRefrensInvoiceId` + overrides + project fields (country required) → `createInvoice` on Refrens → `upsertInvoiceFromRefrens` → `updateSlotFields` (label `Ad-hoc · N tasks`, line-item notes) → `markTasksInvoiced` → `invalidateInvoiceListCache`.
4. **Pair a Chrome extension.** User loads the unpacked zip from `/modules/internal-tools` → `useExtensionPairing.probe` sends `PING` to the pinned id (allowed by the manifest's `externally_connectable`) → "Pair with this browser" POSTs `/api/extension/pair` → `requireModule` → `issueExtensionToken` (old tokens revoked, sha256 stored) → the page sends `PAIR {token, apiBase, urlKey, pairedAs}` to the extension, whose `onMessageExternal` checks the sender origin against `PAIRING_ORIGINS` and stores it. Every later call (`/api/extension/refrens/invoices*`, or `/api/projects` and `/api/webflow-settings` for the auditor) runs `requireExtensionToken`: hash lookup, expiry, slug match, `hasModuleAccess` again.
5. **Skydo reconciliation (bridge).** On a Skydo unmapped-payment page, `skydo-panel.js` reads the payment → background `FIND_MATCHES` → `refrens-api.js` fires four parallel proxy queries (amount ±3%, balance due ±3%, `UNPAID`/`PARTIALLY_PAID`, payer-name regex) → server `queryInvoicesForExtension` drops non-allowlisted keys and forces `$select` → `match.js` ranks → "Get invoice PDF" fetches `/api/extension/refrens/invoices/{id}` for `share.link` → `capture.js` prints it to PDF → the panel sets the file on Skydo's upload input. The confirm stays manual in Skydo.
6. **Screenshot run with upload.** `/modules/screenshot-runner` builds the heredoc + `npx @activeset/capture run … --upload <origin>` → on the user's machine the engine captures desktop/mobile, writes `manifest.json` signed with `signManifest` → `capture-upload.ts` POSTs `init` (server `verifySignature`, creates `capture_runs/{runId}`), one multipart `file` per image (Storage save + `arrayUnion`), then `finalize` → returns `shareUrl` `/captures/{runId}`, rendered by `CaptureViewer`. The project Image Library later finds runs by project name through `/api/capture-runs`.

## Gotchas and invariants

- **Invoices are admin-only, not "invoices module" gated.** Every `/api/refrens/*` route uses `requireAdmin` and the tab/billing button render only for `isAdmin` ([ProjectDetailScreen.tsx:421](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx), [:517](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx)). The `invoices` grant in Team Access ("Invoices & Refrens") only controls the Skydo bridge and its Internal Tools card.
- **Admins are not auto-granted on the extension proxy.** Pairing uses `requireModule`, which lets admins through, but `requireExtensionToken` calls server `hasModuleAccess` ([extension-tokens.ts:130](../../src/lib/extension-tokens.ts)), which has no admin bypass ([module-access.ts](../../src/lib/module-access.ts)), unlike the client `AccessControlService.hasModuleAccess`. An admin not listed under `modules.invoices` can pair and then get 403 on every bridge request.
- **Extension ids are pinned by the manifest `key`.** Changing or removing `key` in [chrome-extension/manifest.json](../../chrome-extension/manifest.json) or [refrens-skydo-bridge/manifest.json](../../extensions/refrens-skydo-bridge/manifest.json) breaks install detection and pairing. The registry, catalogue and `externally_connectable` origins must stay in step. Pairing is accepted only from `https://app.activeset.co` and `http://localhost:3000` (`PAIRING_ORIGINS`, [chrome-extension/background.js:386](../../chrome-extension/background.js), [bridge background.js:126](../../extensions/refrens-skydo-bridge/src/background.js)), so a preview deployment cannot pair.
- **`ALLOWED_QUERY_KEYS` is the bridge's contract** ([RefrensService.ts:351](../../src/services/RefrensService.ts)). Unknown keys are dropped, `$limit` capped at 50, `$select` forced. Adding a probe to the extension needs a matching server allowlist entry or it is silently ignored.
- **Pairing replaces, not adds.** `issueExtensionToken` revokes the person's existing tokens for that slug first ([extension-tokens.ts:62](../../src/lib/extension-tokens.ts)), so pairing a second browser logs out the first. Tokens without `expiresAt` (pre-expiry records) never expire.
- **Refrens caches are per serverless instance.** JWT and the 500-invoice list live in module variables ([RefrensService.ts:27](../../src/services/RefrensService.ts), [:257](../../src/services/RefrensService.ts)); `/available?refresh=1` bypasses the list cache. Credential saves invalidate only the instance that served the save.
- **`PARTIALLY_PAID` becomes `UNKNOWN` in the mirror.** `normalizeStatus` only knows PAID/CANCELED/UNPAID ([invoices.repository.ts:36-42](../../src/modules/invoices/infrastructure/invoices.repository.ts)); the bridge treats `PARTIALLY_PAID` as a real Refrens status. `UNKNOWN` rows keep being synced by the cron.
- **OVERDUE is computed locally** from `dueDate`, never read from Refrens ([invoices.repository.ts:40](../../src/modules/invoices/infrastructure/invoices.repository.ts)). `PENDING` means "no Refrens invoice attached", and the cron skips it ([refrens-sync:90](../../src/app/api/cron/refrens-sync/route.ts)).
- **`from-tasks` writes to Refrens before Firestore.** If the mirror upsert or `markTasksInvoiced` fails after `createInvoice`, the invoice exists on Refrens with unstamped tasks; recovery is map + `/link-tasks`. Validation before the Refrens call is all-or-nothing.
- **One Refrens invoice maps to one project.** `/map` returns 409 when `findInvoiceByRefrensId` finds it elsewhere; deleting a mirror row (`DELETE /api/refrens/invoices/[id]`) never touches Refrens.
- The stale comment in [refrens/invoices/route.ts:13](../../src/app/api/refrens/invoices/route.ts) says invoice creation is not supported; `/from-tasks` creates invoices.
- The cron's `summary.emails` counter increments whenever an opted-in status changes, even if the email was `skipped` for missing Gmail env ([refrens-sync:125](../../src/app/api/cron/refrens-sync/route.ts)). Email amounts default to `INR` when currency is null ([NotificationService.ts:878](../../src/services/NotificationService.ts)).
- **Raycast shared token = admin, with a self-declared identity.** A matching `RAYCAST_API_TOKEN` returns `isAdmin: true` and whatever `@activeset.co` address the client puts in `x-activeset-user-email` ([raycast-auth.ts:33](../../src/lib/raycast-auth.ts), [:49-55](../../src/lib/raycast-auth.ts)); the comparison is a plain `!==`, not timing-safe. Treat the token as a team-wide admin credential. `vercel env pull` returns it as `[SENSITIVE]` (memory note), so local dev needs its own value.
- **`DELETE /api/raycast/projects/[projectId]` deletes only the project document** ([raycast-projects.ts:280](../../src/lib/raycast-projects.ts)); subcollections, tasks, invoices and checklists are left behind. The Raycast app does not call it today.
- **Capture upload is not really authenticated.** The HMAC default key `activeset-capture-v1` ships inside the public npm package ([upload-captures/route.ts:21](../../src/app/api/upload-captures/route.ts), [signing.ts](../../packages/activeset-capture/src/core/signing.ts)), so anyone can sign a manifest unless `ACTIVESET_UPLOAD_KEY` is set on both ends (and then the public CLI cannot upload). The `file` and `finalize` phases check only that the `runId` exists ([:165](../../src/app/api/upload-captures/route.ts), [:207](../../src/app/api/upload-captures/route.ts)). `init` uses `.set()` ([:154](../../src/app/api/upload-captures/route.ts)), so re-uploading with the same predictable run id (`<slug>-<timestamp>`) replaces that run's document. CORS is `*`.
- **Captures are public.** Images are saved `public: true` ([:239](../../src/app/api/upload-captures/route.ts)); `/captures/[runId]` and `/api/capture-runs` have no auth. `/api/capture-runs` scans the whole collection on every call, and a run with an empty `projectName` matches every query (`queryLower.includes('')`).
- **Two capture engines drift.** `npm run capture:local` uses [src/local-capture](../../src/local-capture/) (no signing, concurrency 3), so its manifests cannot be uploaded; the npm package and `capture:wizard` use `packages/activeset-capture/src`. Fix bugs in the package; the fork only has tests.
- **The repo's `@activeset/capture` version lags npm.** [package.json](../../packages/activeset-capture/package.json) says 0.4.3 while `npm view @activeset/capture version` returned 0.4.5 on 2026-09-23, and no `capture-v*` git tags exist locally. Check the registry before bumping.
- **Unpacked extensions do not auto-update.** The version in the zip filename is the only signal. Bump the manifest, re-run `npm run extension:pack:all`, update `download`/`version` in [tools.ts](../../src/modules/internal-tools/data/tools.ts), commit the zip.
- The Screenshot Runner catalogue note "Runs in the browser against live URLs" ([tools.ts:70](../../src/modules/internal-tools/data/tools.ts)) is wrong: capture runs locally via the CLI.

## Tests

| Test | Runs with |
|---|---|
| [src/local-capture/io.test.ts](../../src/local-capture/io.test.ts), [manifest.test.ts](../../src/local-capture/manifest.test.ts) | `npm run test:local-capture` (also part of `npm test`). They cover the in-repo fork, not the published package |
| [extensions/refrens-skydo-bridge/test/worker.test.js](../../extensions/refrens-skydo-bridge/test/worker.test.js) | `node test/worker.test.js` from the extension folder (stubs Chrome APIs + endpoints) |
| [extensions/refrens-skydo-bridge/test/match.test.js](../../extensions/refrens-skydo-bridge/test/match.test.js) | `node test/match.test.js` (runs `match.js` in a `vm` context) |
| [extensions/refrens-skydo-bridge/test/capture.test.js](../../extensions/refrens-skydo-bridge/test/capture.test.js) | `node test/capture.test.js "<share.link>"` (needs headless Chrome and a real link) |
| [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) | `npm run test:rules`; only touches this area via the open `webflow_sessions` rule |

No tests for `RefrensService`, the invoice repository, `payment-templates`, `task-billing`, `extension-tokens`, the Raycast facade or the upload route.

## Related docs

| Doc | Verdict |
|---|---|
| [docs/features/internal-tools.md](../features/internal-tools.md) | Accurate on pairing, expiry, revocation, the auditor's use of `requireCallerOrExtensionToken` and the catalogue workflow. Does not mention the admin-without-grant 403 above |
| [docs/features/refrens-skydo-bridge.md](../features/refrens-skydo-bridge.md) | Partially stale: "Install" and "Authenticate" still describe per-user Refrens API keys, `app-secret` JWT exchange and a `refrens.com` session fallback. v3.0.0 goes only through the app's proxy with a pairing token. Matching/PDF sections are still right |
| [extensions/refrens-skydo-bridge/README.md](../../extensions/refrens-skydo-bridge/README.md) | Partially stale: install step 3 (API keys / borrowed session), "API-key exchange is single-flighted", triage step 1, and `refrens-token.js` in the layout (file does not exist). The auth row in "How it works" is current |
| [extensions/refrens-skydo-bridge/INSTALL.md](../../extensions/refrens-skydo-bridge/INSTALL.md) | Accurate for loading unpacked; not re-checked line by line for pairing |
| [docs/features/webflow-tracker-extension.md](../features/webflow-tracker-extension.md) | Stale: says version 1.0.1 and location `public/webflow-tracker/` (current source is `webflow-team-tracker-1.0.6/`, v1.0.6; the public copy is a duplicate) |
| [docs/features/screenshot-runner.md](../features/screenshot-runner.md) | Partially stale: references `install-local-capture.sh` / `.ps1` (not in the repo), says default concurrency 3 (package default is 6) and "local-only, does not auto-sync" (there is now `--upload` and `/captures/[runId]`) |
| [docs/features/capture-package-publish.md](../features/capture-package-publish.md) | Accurate on the workflow (`capture-v*` tag, `NPM_TOKEN`); the example tag `capture-v0.1.0` and the `/workspace/...` path are dated |
| [apps/raycast/README.md](../../apps/raycast/README.md) | Accurate |
| [packages/activeset-capture/README.md](../../packages/activeset-capture/README.md) | Partially stale: says "Output is local files only" and omits the `upload` command and `--sitemap` |
