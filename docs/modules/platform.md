---
module: platform
title: Platform (shell, auth, access control, Firebase, settings, infra config)
keywords: [platform, app shell, AppFrame, AppRail, HintBar, rail, sidebar, navigation, nav items, AppNavigation, header, mobile menu, command palette, cmdk, ⌘K, keyboard shortcuts, useShortcut, chords, "g p", "?", ShortcutHelp, theme, dark mode, light mode, next-themes, home, dashboard, "Recent opens", greeting, login, "Continue with Google", sign in, sign out, auth, useAuth, AuthProvider, Firebase Auth, Google Sign-In, "@activeset.co", admin, ADMIN_EMAILS, isAdmin, custom claim, module access, useModuleAccess, AccessControlService, access_control, module_access, Team Access, requireCaller, requireAdmin, requireModule, requireProjectAccess, api-auth, bearer token, ID token, cron secret, CRON_SECRET, isCronAuthorized, firebase-admin, service account, hasFirebaseAdminCredentials, dev-token, local dev, mock user, localhost, configurations, Template Management, settings, About Us, Terms, Titles, Agencies, Services, Deliverables, app_secrets, project_secrets, firestore.rules, storage.rules, firestore.indexes.json, vercel.json, crons, next.config, CORS, eslint, lint:architecture, modular monolith, ping, privacy policy]
entry_points: [/, /privacy, /modules/proposal/settings, /api/auth/dev-token, /api/ping]
code_roots: [src/components/shell, src/shared, src/platform, src/modules/auth-access, src/lib, src/app/modules/settings, src/services/AccessControlService.ts]
last_verified: 2026-09-23 @ a00f91e
---
# Platform (shell, auth, access control, Firebase, settings, infra config)

> The cross-cutting layer every other module sits on. It covers the signed-in app shell (left icon rail, page header, bottom hint bar, ⌘K command palette, keyboard-shortcut registry, theme), the Home screen at `/`, Google sign-in limited to `@activeset.co`, the admin list and per-module access grants (`access_control/module_access`), the server-side auth helpers every API route uses (`requireCaller` / `requireAdmin` / `requireModule` / `requireProjectAccess`, `isCronAuthorized`), the Firebase client and firebase-admin bootstrap, server-only secret stores, the proposal "Template Management" settings (`configurations/*`), and the repo-level config (`firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`, `vercel.json`, `next.config.ts`, `eslint.config.mjs`, `package.json` scripts). Internal team members see it on every page; clients never see the shell (it renders bare on `/portal`, `/share`, `/view`, `/embed`).

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Add a module to the rail / palette / Home list | `NAV_ITEMS` in [nav-items.tsx](../../src/components/shell/nav-items.tsx) |
| Change what wraps every page (rail, hint bar, palette mount) | `AppFrame` in [AppFrame.tsx](../../src/components/shell/AppFrame.tsx) |
| Change the page header (title, back button, scan/alert bells, search button) | `AppNavigation` in [AppNavigation.tsx](../../src/shared/ui/AppNavigation.tsx) |
| Add a keyboard shortcut | `useShortcut` in [shortcuts.tsx](../../src/shared/keyboard/shortcuts.tsx) |
| Add j/k list navigation to a list | `useListNavigation` in [useListNavigation.ts](../../src/shared/keyboard/useListNavigation.ts) |
| Change the ⌘K palette (actions, admin-only links) | `CommandPalette` in [CommandPalette.tsx](../../src/components/CommandPalette.tsx) |
| Change the Home screen | `Home` in [page.tsx](../../src/app/page.tsx), `RecentProjectsPanel` in [RecentProjectsPanel.tsx](../../src/components/dashboard/RecentProjectsPanel.tsx) |
| Change the login screen | `LoginForm` in [LoginForm.tsx](../../src/modules/auth-access/ui/components/LoginForm.tsx) |
| Change sign-in / domain restriction / localhost dev login | `AuthProvider` in [useAuth.ts](../../src/modules/auth-access/ui/hooks/useAuth.ts) |
| Change who is an admin | `ADMIN_EMAILS` in [AccessControlService.ts](../../src/services/AccessControlService.ts) AND [api-auth.ts](../../src/lib/api-auth.ts) AND `isAdmin()` in [firestore.rules](../../firestore.rules) (three copies) |
| Add a restricted module | `RESTRICTED_MODULES` in [AccessControlService.ts](../../src/services/AccessControlService.ts); also `NavAccess` in [nav-items.tsx](../../src/components/shell/nav-items.tsx) |
| Check module access client-side | `useModuleAccess` in [useModuleAccess.ts](../../src/modules/auth-access/ui/hooks/useModuleAccess.ts) |
| Protect an API route | `requireCaller` / `requireAdmin` / `requireModule` / `requireProjectAccess` in [api-auth.ts](../../src/lib/api-auth.ts) |
| Protect a cron route / call a cron internally | `isCronAuthorized`, `getCronSecretHeaders` in [cron-auth.ts](../../src/lib/cron-auth.ts) |
| Call an authed API from the browser | `fetchAuthed`, `fetchForProject` in [api-client.ts](../../src/lib/api-client.ts) |
| Build an absolute link (emails, portal, Slack) | `getBaseUrl`, `portalUrl` in [base-url.ts](../../src/lib/base-url.ts); server-to-self fetches use `getRequestBaseUrl` in [scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts) |
| Use Firestore from the browser | `db`, `auth`, `googleProvider` in [firebase.ts](../../src/lib/firebase.ts) |
| Use Firestore/Auth server-side | `db`, `auth`, `hasFirebaseAdminCredentials`, `getServiceAccountCredentials` in [firebase-admin.ts](../../src/lib/firebase-admin.ts) |
| Load `.env.local` in a tsx script before firebase-admin | `import '@/lib/load-env'` first ([load-env.ts](../../src/lib/load-env.ts)) |
| Store an app-level third-party credential | [appSecrets.ts](../../src/services/appSecrets.ts) (`app_secrets/{integration}`) |
| Store a per-project token | [projectSecrets.ts](../../src/services/projectSecrets.ts) (`project_secrets/{projectId}`) |
| Edit proposal templates / team access UI | [proposal/settings/page.tsx](../../src/app/modules/proposal/settings/page.tsx) + editors in [settings/components](../../src/app/modules/settings/components) |
| Change Firestore security | [firestore.rules](../../firestore.rules), test in [firestore.rules.test.ts](../../tests/firestore.rules.test.ts) |
| Add a composite index | [firestore.indexes.json](../../firestore.indexes.json), deploy with [deploy-firestore-indexes.ts](../../scripts/deploy-firestore-indexes.ts) |
| Add / change a cron | [vercel.json](../../vercel.json) + a route under [src/app/api/cron](../../src/app/api/cron) |
| Find any env var | [env-vars.md](./env-vars.md) |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/` | [page.tsx](../../src/app/page.tsx) | Signed out: `LoginForm`. Signed in: greeting, numbered module list (from `useNavItems`), Recent opens, `DashboardAlertPanel`, `DailyHealthPanel` | Any signed-in user; login screen for everyone else |
| `/privacy` | [privacy/page.tsx](../../src/app/privacy/page.tsx) | Static privacy policy for the "Webflow Team Tracker" Chrome extension | Public, no shell |
| `/modules/proposal/settings` | [proposal/settings/page.tsx](../../src/app/modules/proposal/settings/page.tsx) | "Template Management": tabs About Us, Terms, Titles, Agencies, Services, Deliverables, and (admins only) Team Access | No auth check in the page itself (see Gotchas). Linked from the proposal dashboard |
| `/modules/clickup-settings` | [clickup-settings/page.tsx](../../src/app/modules/clickup-settings/page.tsx) | ClickUp integration admin page — owned by `clickup-tasks` | Admin (palette shows it only to admins) |
| `/modules/refrens-settings` | [refrens-settings/page.tsx](../../src/app/modules/refrens-settings/page.tsx) | Refrens credentials admin page (uses `app_secrets/refrens`) — invoices feature, see `tools-and-extensions` | Admin |

There is no `middleware.ts`/`proxy.ts`: every page gate is client-side (`useAuth`, `useModuleAccess`), and the data is protected by Firestore rules and API route checks.

## API routes

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| POST | `/api/auth/dev-token` | [route.ts](../../src/app/api/auth/dev-token/route.ts) | None, but 404 unless `NODE_ENV !== 'production'` and Host is localhost | Mints a Firebase custom token for `local-dev@activeset.co` with `{ admin: true }` (creates the Auth user if missing). 503 without admin creds |
| GET | `/api/ping` | [route.ts](../../src/app/api/ping/route.ts) | None | Returns `{ status: 'ok' }`. No caller in this repo |

Every cron route is owned by the module it serves; the scheduling is listed under Background jobs.

## Code map

### App shell — `src/components/shell`, `src/components/*`
- [AppFrame.tsx](../../src/components/shell/AppFrame.tsx) — `AppFrame`: on `/` and `/modules/*` with a user, renders `AppRail` + `HintBar` and pads content; mounts `ShortcutHelp` + `CommandPalette` on app routes only (so `?` does nothing on `/portal`).
- [AppRail.tsx](../../src/components/shell/AppRail.tsx) — `AppRail` (desktop-only icon rail), `RailItem` (registers the `g <key>` chord per nav item), `ThemeButton` (`mod+shift+l`), `UserMenu` (shortcuts, sign out).
- [HintBar.tsx](../../src/components/shell/HintBar.tsx) — `HintBar`: bottom strip showing the last three shortcuts registered with `hint: true`, or the pending chord.
- [nav-items.tsx](../../src/components/shell/nav-items.tsx) — `NAV_ITEMS` (single source for rail, mobile sheet, palette, Home), `useNavItems()` resolves grants, `isNavItemActive()`.
- [index.ts](../../src/components/shell/index.ts) — barrel.
- [AppProviders.tsx](../../src/components/AppProviders.tsx) — `AppProviders`: `ThemeProvider` (default dark, forced light on `/portal`) → `AuthProvider` → `ShortcutProvider` → `AppFrame` + sonner `Toaster`.
- [CommandPalette.tsx](../../src/components/CommandPalette.tsx) — `CommandPalette`: `mod+k` / `/`, opened by the `commandk:open` window event; Go-to (nav items, plus ClickUp/Refrens settings for admins), Actions (new project, theme, shortcuts, sign out), live project search via `projectLinksRepository.subscribeToAllProjects` only while open.
- [theme-provider.tsx](../../src/components/theme-provider.tsx) — thin `next-themes` wrapper.
- [mode-toggle.tsx](../../src/components/mode-toggle.tsx) — `ModeToggle` dropdown. Not imported anywhere (dead; the rail's `ThemeButton` replaced it).
- [navigation/AppNavigation.tsx](../../src/components/navigation/AppNavigation.tsx) — compatibility shim re-exporting `@/shared/ui`.
- [navigation/ScanActivityIndicator.tsx](../../src/components/navigation/ScanActivityIndicator.tsx) — header dropdown polling `GET /api/scan-bulk/running-all` (backs off to 20 s when tab hidden). Data owned by `site-audit`.
- [navigation/AlertIndicator.tsx](../../src/components/navigation/AlertIndicator.tsx) — header bell over `useAlerts` (`site_alerts`). Data owned by `site-monitoring`.
- [views/ViewsPopover.tsx](../../src/components/views/ViewsPopover.tsx) — generic "who opened this" popover over a `/views` endpoint (Bearer ID token); used by proposals and the client portal link card.
- [dashboard/RecentProjectsPanel.tsx](../../src/components/dashboard/RecentProjectsPanel.tsx) — "Recent opens" on Home, from `useRecentProjects` ([recent-projects.ts](../../src/lib/recent-projects.ts), localStorage key `activeset:recent-projects`, max 8).
- [dashboard/Dashboard.tsx](../../src/components/dashboard/Dashboard.tsx) — shim re-exporting `ProjectLinksDashboardScreen` as `Dashboard`.
- [auth/LoginForm.tsx](../../src/components/auth/LoginForm.tsx) — shim re-exporting `LoginForm`.
- Global CSS tokens: `--shell-rail`, `--shell-header`, `--shell-hintbar`, `.sh-row`, `.sh-glow` in [globals.css](../../src/app/globals.css).

### Shared — `src/shared`
- [keyboard/shortcuts.tsx](../../src/shared/keyboard/shortcuts.tsx) — `ShortcutProvider` (one window `keydown` listener), `useShortcut`, `useShortcuts`, `usePendingChord`, `useOpenShortcutHelp` (dispatches `shortcuts:help`), `formatKeys`, `isTypingTarget`, `isMac`. Chord timeout 1000 ms; last-registered wins on key collisions.
- [keyboard/useListNavigation.ts](../../src/shared/keyboard/useListNavigation.ts) — `j`/`down`, `k`/`up`, `g g` (first), `enter`, optional `x` toggle; rows get `data-nav-index` / `data-selected`.
- [keyboard/ShortcutHelp.tsx](../../src/shared/keyboard/ShortcutHelp.tsx) — `?` / `mod+/` sheet listing live shortcuts by group.
- [keyboard/Kbd.tsx](../../src/shared/keyboard/Kbd.tsx) — `Kbd`, `KeyCombo`.
- [ui/AppNavigation.tsx](../../src/shared/ui/AppNavigation.tsx) — `AppNavigation` header (title, back link + `escape` shortcut when `showBackButton`, children actions, scan + alert indicators, search button) and `MobileMenu` sheet. Returns `null` while auth loads or signed out.
- [contracts/module-access.ts](../../src/shared/contracts/module-access.ts) — `RestrictedModule = 'proposal' | 'project-links'` (stale: omits `invoices`; not imported by anything that matters).
- [lib/index.ts](../../src/shared/lib/index.ts) — re-exports `cn`, `DatabaseError`, `logError`, validation.

### Platform facade — `src/platform` (21 lines total, re-exports only)
- [firebase/client.ts](../../src/platform/firebase/client.ts) → `@/lib/firebase`; [firebase/admin.ts](../../src/platform/firebase/admin.ts) → `@/lib/firebase-admin`; [auth/access-control.ts](../../src/platform/auth/access-control.ts) → `AccessControlService`; [auth/cron.ts](../../src/platform/auth/cron.ts) → `cron-auth`; [notifications/index.ts](../../src/platform/notifications/index.ts) → `NotificationService` senders; [scans/dispatch.ts](../../src/platform/scans/dispatch.ts) → `scan-job-dispatch`; [webflow/utils.ts](../../src/platform/webflow/utils.ts) → `webflow-utils`.

### Auth & access — `src/modules/auth-access`, services, lib
- [modules/auth-access/index.ts](../../src/modules/auth-access/index.ts) — public API: `AuthProvider`, `useAuth`, `useModuleAccess`, `LoginForm`.
- [ui/hooks/useAuth.ts](../../src/modules/auth-access/ui/hooks/useAuth.ts) — `AuthProvider` context: `user`, `loading`, `error`, `isAdmin`, `signInWithGoogle`, `logout`, `clearError`, `isAuthenticated`. Localhost: `signInForLocalDev()` then `buildLocalDevMockUser()` fallback.
- [ui/hooks/useModuleAccess.ts](../../src/modules/auth-access/ui/hooks/useModuleAccess.ts) — `useModuleAccess(module, { enabled })` with a 5-minute in-memory cache + in-flight dedupe.
- [hooks/useAuth.ts](../../src/hooks/useAuth.ts), [hooks/useModuleAccess.ts](../../src/hooks/useModuleAccess.ts) — legacy shims (lint forbids them inside `src/modules`).
- [services/AccessControlService.ts](../../src/services/AccessControlService.ts) — client SDK singleton `accessControlService`: `getModuleAccess` (seeds default doc only when an admin is signed in), `saveModuleAccess`, `hasModuleAccess`, `isAdmin`, `getModuleUsers`, `addModuleAccess`, `removeModuleAccess` (refuses admins). Exports `ADMIN_EMAILS`, `RESTRICTED_MODULES`, `ModuleAccess`.
- [lib/module-access.ts](../../src/lib/module-access.ts) — server mirror `hasModuleAccess(email, module)` via firebase-admin.
- [lib/api-auth.ts](../../src/lib/api-auth.ts) — `requireCaller`, `requireModule`, `requireAdmin`, `requireProjectAccess`, `getProjectIdFromRequest` (`x-project-id` header or `?projectId=`), `ApiAuthError`, `apiAuthErrorResponse`.
- [lib/cron-auth.ts](../../src/lib/cron-auth.ts) — `isCronAuthorized` (Bearer or `x-cron-secret`, timing-safe), `getCronSecretHeaders`.

### Firebase and shared infra — `src/lib`
- [firebase.ts](../../src/lib/firebase.ts) — web SDK app; `auth` and `googleProvider` are `null` on the server; `db` is always created.
- [firebase-admin.ts](../../src/lib/firebase-admin.ts) — admin init (service-account JSON → explicit email/key → ADC), `ignoreUndefinedProperties: true`, mock `db`/`auth` when no creds, `hasFirebaseAdminCredentials`, `getServiceAccountCredentials()` (reused for Google Sheets/Drive by `delivery`).
- [runtime-env.ts](../../src/lib/runtime-env.ts) — `readEnv`, `readFirstEnv` (trimmed, empty = undefined).
- [load-env.ts](../../src/lib/load-env.ts) — side-effect dotenv load of `.env.local`, `.env.vercel-production`, `.env` (first value wins); `isPlaceholder`, `env()`.
- [base-url.ts](../../src/lib/base-url.ts) — `getBaseUrl` (`NEXT_PUBLIC_BASE_URL` → `APP_BASE_URL` → `app.activeset.co` on prod → `VERCEL_URL` → localhost), `portalPath`, `portalUrl`.
- [api-client.ts](../../src/lib/api-client.ts) — `fetchForProject(projectId, …)` (Bearer + `x-project-id`), `fetchAuthed(…)` (Bearer).
- [errors.ts](../../src/lib/errors.ts) — `AppError`, `ValidationError`, `NetworkError`, `DatabaseError`, `getErrorMessage`, `logError` (also toasts in the browser).
- [validation.ts](../../src/lib/validation.ts) — `validateProjectName`, `validateLinkTitle`, `validateUrl`, `validateLinkData`.
- [constants.ts](../../src/lib/constants.ts) — `COLLECTIONS` (canonical collection names), `BREAKPOINTS`, `ANIMATION_DURATION`, `VALIDATION`, `DEFAULTS`, `ERROR_MESSAGES`.
- [firestore-dates.ts](../../src/lib/firestore-dates.ts) — `toSafeDate`, `toSafeDateOrUndefined` (never throws; epoch 0 fallback).
- [utils.ts](../../src/lib/utils.ts) — `cn`.
- [ui-tones.ts](../../src/lib/ui-tones.ts) — `TONE_CLASSES`, `PROJECT_TAG_TONES`, `PROJECT_STATUS_TONES`, `CLIENT_STATUS_TONES` (the portal must not use these; they carry `dark:` variants).
- [format-money.ts](../../src/lib/format-money.ts) — `formatMoney(amount, currency)` via `Intl`, used by tasks and invoices.

### Secrets — `src/services`
- [appSecrets.ts](../../src/services/appSecrets.ts) — `server-only`; `app_secrets/refrens` get/set/delete + `getRefrensConfigStatus` (never returns the private key). ClickUp's `app_secrets/clickup` doc is read directly by the ClickUp routes (see `clickup-tasks`).
- [projectSecrets.ts](../../src/services/projectSecrets.ts) — `server-only`; `project_secrets/{projectId}.webflowApiToken`: `getWebflowToken`, `setWebflowToken`, `deleteWebflowToken`, `hasWebflowToken`. Webflow usage: see `webflow`.

### Settings — `src/app/modules/settings`, `src/modules/settings`, hooks
- [SimpleListEditor.tsx](../../src/app/modules/settings/components/SimpleListEditor.tsx) — string list (drag to reorder), Save → `updateDoc(configurations/{docId}, { items })`.
- [RichItemEditor.tsx](../../src/app/modules/settings/components/RichItemEditor.tsx) — master/detail rich-text `ConfigurationItem[]`.
- [KeyValueEditor.tsx](../../src/app/modules/settings/components/KeyValueEditor.tsx) — key → rich text map (`services`).
- [AgencyEditor.tsx](../../src/app/modules/settings/components/AgencyEditor.tsx) — `AgencyProfile[]` with signature capture (`configurations/agencies`).
- [TeamAccessEditor.tsx](../../src/app/modules/settings/components/TeamAccessEditor.tsx) — admin UI over `accessControlService` for `proposal`, `project-links`, `invoices`.
- [modules/settings/index.ts](../../src/modules/settings/index.ts) — barrel re-exporting the five editors; nothing imports it.
- [hooks/useConfigurations.ts](../../src/hooks/useConfigurations.ts) — `useConfigurations()`: six `onSnapshot` listeners on `configurations/{titles,agencies,services,about_us,terms,deliverables}`; types `Configurations`, `ConfigurationItem`, `AgencyProfile`.

### Types
Platform has no dedicated types file; `ModuleAccess` / `RestrictedModule` live in `AccessControlService.ts`, `AuthedCaller` in `api-auth.ts`, configuration types in `useConfigurations.ts`.

## Data model

| Path | One doc is | Key fields (type / file) | Written by | Read by | SDK |
|---|---|---|---|---|---|
| `access_control/module_access` | The only doc: all module grants | `admin: string`, `modules: Record<string, string[]>` (`"*"` = everyone) — `ModuleAccess` in [AccessControlService.ts](../../src/services/AccessControlService.ts) | `TeamAccessEditor` via `accessControlService.saveModuleAccess` (admin only by rules); auto-seeded on first read by an admin | `useModuleAccess` (client), `hasModuleAccess` in [module-access.ts](../../src/lib/module-access.ts) (server) | client + admin |
| `configurations/{titles,agencies,services,about_us,terms,deliverables}` | One template list | `items`: `string[]` (titles), `AgencyProfile[]` (agencies), `Record<string,string>` (services), `ConfigurationItem[]` (the rest) — [useConfigurations.ts](../../src/hooks/useConfigurations.ts) | Settings editors (`updateDoc`) | `useConfigurations` (settings page, proposal wizard/editor, agency signature dialog) | client |
| `app_secrets/{integration}` (`refrens`, `clickup`) | App-level third-party credential | refrens: `urlKey`, `appId`, `privateKey`, `updatedAt` ([appSecrets.ts](../../src/services/appSecrets.ts)) | admin API routes | server routes | admin only |
| `project_secrets/{projectId}` | A project's Webflow token | `webflowApiToken`, `webflowTokenUpdatedAt` ([projectSecrets.ts](../../src/services/projectSecrets.ts)) | Webflow settings route, `scripts/migrate-webflow-tokens.ts` | Webflow routes, [project-admin.ts](../../src/lib/project-admin.ts) | admin only |
| Firebase Auth user `local-dev@activeset.co` | Local dev identity | custom claim `admin: true` | `/api/auth/dev-token` (creates it in whichever project the admin creds point at) | `useAuth` | admin |
| `localStorage` `activeset:recent-projects` | Recent opens | `RecentProject[]` ([recent-projects.ts](../../src/lib/recent-projects.ts)) | `recordRecentProject` | Home | browser |

Collection names are centralised in `COLLECTIONS` ([constants.ts](../../src/lib/constants.ts)), but many callers still use string literals (e.g. `'access_control'`, `'configurations'`, `'project_secrets'` in `project-admin.ts`).

**firestore.rules** ([firestore.rules](../../firestore.rules)), verified line by line:
- Helpers: `isAdmin()` = email `rehan@activeset.co` or `salman@activeset.co` or `token.admin == true`; `isActiveSetUser()` = email matches `.*@activeset\.co$`.
- Deny all: `project_secrets`, `proposal_views`, `workers/{id}` writes, `workers/{id}/commands` update/delete, `projects/{id}/image_index` writes. Not listed, so default deny: `app_secrets`, `client_portal_tokens`, `projects/{id}/portal_views`, `extension_tokens`, `project_invoices`.
- Team only (`isActiveSetUser`): `projects` (plus `writeHasNoApiToken()` on create/update and `userId` immutable), `projects/{id}/{link_audits,audit_decisions,alt_suggestions,image_budget,pages}`, `worker_jobs` (delete admin-only), `workers/{id}/control`, `proposals`, `templates`.
- Public read, team write: `project_timelines`, `project_checklists`, `tasks`, `requests`, `shared_proposals`.
- Public read, admin write: `access_control`.
- Fully open (`read, write: if true`): `timeline_templates`, `sop_templates`, `scan_jobs`, `site_alerts`, `health_reports`, `scan_notifications`, `audit_logs`, `content_changes`, `schema_analyses`, `cmsRuns` (+`events`), `schemaRuns` (+`events`), `configurations`, `webflow_account_history`, `webflow_sessions`, `webflow_pings`.
- Special: `proposal_comments` (public create when `authorType == 'client'`), `proposal_history` (public create when `changeType == 'signed'`).

**storage.rules** ([storage.rules](../../storage.rules)): `screenshots/{projectId}/{linkId}/{filename}` public read AND public write (`TODO` in file); everything else denied. `firebase.json` has no `storage` key, so the Firebase CLI in this repo does not deploy this file.

**firestore.indexes.json** ([firestore.indexes.json](../../firestore.indexes.json)) — 8 composite indexes, no field overrides:
`projects(userId↑, updatedAt↓)`, `proposal_views(proposalId↑, viewedAt↓)`, `audit_logs(projectId↑, linkId↑, timestamp↓)`, `content_changes(linkId↑, timestamp↓)`, `site_alerts(dismissed↑, read↑, createdAt↓)`, `site_alerts(dismissed↑, createdAt↓)`, `proposal_comments(proposalId↑, createdAt↑)`, `proposal_history(proposalId↑, timestamp↓)`.

**firebase.json** ([firebase.json](../../firebase.json)): firestore rules + indexes, emulator on port 8080, emulator UI off.

## Background jobs

Vercel crons from [vercel.json](../../vercel.json) (UTC). Every route listed calls `isCronAuthorized` (Vercel sends `Authorization: Bearer $CRON_SECRET`).

| Schedule | Path | Route file | Methods | Owning module |
|---|---|---|---|---|
| `30 0 * * *` (00:30 daily) | `/api/cron/daily-scan` | [route.ts](../../src/app/api/cron/daily-scan/route.ts) | GET | site-monitoring |
| `0 1 * * *` (01:00 daily) | `/api/cron/webflow-sitemap-diff` | [route.ts](../../src/app/api/cron/webflow-sitemap-diff/route.ts) | GET | webflow |
| `0 4 * * *` (04:00 daily) | `/api/cron/health-report` | [route.ts](../../src/app/api/cron/health-report/route.ts) | GET | site-monitoring |
| `20 * * * *` (hourly) | `/api/cron/auto-optimise` | [route.ts](../../src/app/api/cron/auto-optimise/route.ts) | GET | worker-alt-text-images |
| `*/5 * * * *` (every 5 min) | `/api/cron/scan-jobs` | [route.ts](../../src/app/api/cron/scan-jobs/route.ts) | GET | site-audit |
| `0 9 * * *` (09:00 daily) | `/api/cron/refrens-sync` | [route.ts](../../src/app/api/cron/refrens-sync/route.ts) | GET, POST | tools-and-extensions |
| `*/15 * * * *` (every 15 min) | `/api/cron/clickup-refresh` | [route.ts](../../src/app/api/cron/clickup-refresh/route.ts) | GET | clickup-tasks |
| `0 14,19 * * 1-5` (14:00, 19:00 weekdays) | `/api/cron/nag-tasks` | [route.ts](../../src/app/api/cron/nag-tasks/route.ts) | GET | clickup-tasks |
| `0 22 * * 1-5` (22:00 weekdays) | `/api/cron/review-digest` | [route.ts](../../src/app/api/cron/review-digest/route.ts) | GET | project-links |
| `35 3 * * *` (03:35 daily) | `/api/cron/delivery-nudge` | [route.ts](../../src/app/api/cron/delivery-nudge/route.ts) | GET | delivery |

Cron routes that exist but are **not scheduled** in `vercel.json`: [cleanup](../../src/app/api/cron/cleanup/route.ts) (GET, POST — prunes old audit logs/content changes; its comment says "should be triggered weekly") and [scan-notifications](../../src/app/api/cron/scan-notifications/route.ts) (GET — drains queued scan notifications as a fallback). Both still require the cron secret.

## Configuration

Full list: [env-vars.md](./env-vars.md). Platform-owned:

| Var | Required? | Used in |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID` | Yes (first four at minimum); inlined at build | [firebase.ts](../../src/lib/firebase.ts) |
| One admin credential: `FIREBASE_SERVICE_ACCOUNT_KEY` / `FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_CREDENTIALS` / `GOOGLE_SERVICE_ACCOUNT_KEY` / `GCLOUD_SERVICE_ACCOUNT_KEY` (JSON, JSON with raw newlines, or base64), or `FIREBASE_CLIENT_EMAIL`+`FIREBASE_PRIVATE_KEY` (and `FIREBASE_ADMIN_*`, `FIREBASE_SERVICE_ACCOUNT_*` aliases), or ADC (`FIREBASE_USE_APPLICATION_DEFAULT=true`, `GOOGLE_APPLICATION_CREDENTIALS`, or `K_SERVICE`/`FUNCTION_TARGET`/`GOOGLE_CLOUD_PROJECT` present) | Yes in production (otherwise every admin read returns empty mocks) | [firebase-admin.ts](../../src/lib/firebase-admin.ts) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET` | Optional overrides | [firebase-admin.ts](../../src/lib/firebase-admin.ts) |
| `CRON_SECRET` | Yes in production (fail closed) | [cron-auth.ts](../../src/lib/cron-auth.ts) |
| `NEXT_PUBLIC_BASE_URL` (alias `APP_BASE_URL`) | Strongly recommended in production | [base-url.ts](../../src/lib/base-url.ts), [scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts) |
| `ACTIVESET_LOCAL_DEV_API_AUTH` / `NEXT_PUBLIC_ACTIVESET_LOCAL_DEV_API_AUTH` = `true` | Optional, dev only | [api-auth.ts](../../src/lib/api-auth.ts) |
| `DEPLOY_ENV_FILE` | Optional | deploy scripts |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` | Needed for any email | [NotificationService.ts](../../src/services/NotificationService.ts) (shared sender) |

Stored config docs: `access_control/module_access`, `configurations/*`, `app_secrets/*`, `project_secrets/*` (see Data model). Feature flags: none; access grants are the only runtime switch.

**package.json scripts** ([package.json](../../package.json)):

| Script | What it does |
|---|---|
| `dev` | `next dev --turbopack` |
| `build` / `start` | `next build` / `next start` (`output: 'standalone'`) |
| `lint` | `next lint` — broken: Next 16.0.10 has no `lint` subcommand (prints usage) |
| `typecheck` | `tsc --noEmit` |
| `lint:architecture` | ESLint over `src/app/page.tsx`, `src/app/**/page.tsx`, `src/modules/**` with `--max-warnings=0` (passes at a00f91e) |
| `arch:check` | `typecheck` + `lint:architecture` |
| `test` | `test:lib` + `test:domain` + `test:alt-text` + `test:worker` + `test:site-monitoring` + `test:local-capture` |
| `test:domain` | delivery, client-portal, site-monitoring domain tests |
| `test:lib` / `test:alt-text` / `test:worker` / `test:site-monitoring` / `test:local-capture` / `test:client-portal` / `test:delivery` | `tsx --test` over the named folders |
| `test:rules` | Firestore emulator + [firestore.rules.test.ts](../../tests/firestore.rules.test.ts) (needs Java) |
| `capture:local` / `capture:wizard` | Local screenshot capture CLIs ([capture-local.ts](../../scripts/capture-local.ts), [capture-wizard.ts](../../scripts/capture-wizard.ts)) — tools-and-extensions |
| `cms-alt` | Webflow CMS alt-text/compression CLI ([cms-alt.ts](../../scripts/cms-alt.ts)) — worker-alt-text-images |
| `alt` | Local Ollama alt-text classifier ([alt-text.ts](../../scripts/alt-text.ts)) — worker-alt-text-images |
| `worker` | Always-on worker ([worker.ts](../../scripts/worker.ts)) — worker-alt-text-images |
| `contract:create` / `:template` / `:instructions` / `:export` | Retainer agreement CLI ([create-contract.ts](../../scripts/create-contract.ts)) |
| `schema:gen` | Schema markup generator via Ollama ([schema-gen.ts](../../scripts/schema-gen.ts)) — webflow |
| `capture:pkg:build` / `capture:pkg:pack` | Build / pack `packages/activeset-capture` |
| `schema-gen:pkg:build` / `schema-gen:pkg:pack` | Build / pack `packages/schema-gen` |
| `verify:ui` / `verify:ui:staged` | Heuristic shadcn/theme/a11y checker ([verify-ui.ts](../../scripts/verify-ui.ts)); both run the same command |
| `security:migrate-webflow-tokens` (`:apply`) | Dry run / apply moving `webflowConfig.apiToken` into `project_secrets` ([migrate-webflow-tokens.ts](../../scripts/migrate-webflow-tokens.ts)) |
| `security:deploy-firestore-rules` | Release `firestore.rules` via Admin SDK `securityRules()` ([deploy-firestore-rules.ts](../../scripts/deploy-firestore-rules.ts)) |
| `extension:pack` / `extension:pack:all` | Zip a Chrome extension into `public/downloads/` ([pack-extension.mjs](../../scripts/pack-extension.mjs)) |

Scripts in `scripts/` with no npm alias: [deploy-firestore-indexes.ts](../../scripts/deploy-firestore-indexes.ts) (run with `tsx`), [seed-templates.ts](../../scripts/seed-templates.ts), [check-gemini-models.ts](../../scripts/check-gemini-models.ts), [test-google-genai.ts](../../scripts/test-google-genai.ts), [test-local-api.ts](../../scripts/test-local-api.ts), [debug-scan.ts](../../scripts/debug-scan.ts), [reproduce-scan.ts](../../scripts/reproduce-scan.ts).

**next.config.ts** ([next.config.ts](../../next.config.ts)): wrapped in `withWorkflow` (Vercel Workflow; used by [image-scan.ts](../../src/workflows/image-scan.ts)); `serverExternalPackages` puppeteer, puppeteer-core, @sparticuz/chromium, sharp; `outputFileTracingIncludes` ships the chromium binary to `/api/generate-pdf/**`; `output: 'standalone'`; images from `www.google.com`, AVIF/WebP; headers: `/portal/:path*` gets `Referrer-Policy: no-referrer` + `X-Robots-Tag: noindex, nofollow, noarchive`; `/api/:path*` gets `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` and GET/DELETE/PATCH/POST/PUT; `optimizePackageImports` lucide-react, @radix-ui/react-icons, date-fns.

## External services

| Service | Where | Auth |
|---|---|---|
| Firebase Auth (Google popup, custom tokens) | [useAuth.ts](../../src/modules/auth-access/ui/hooks/useAuth.ts), [dev-token route](../../src/app/api/auth/dev-token/route.ts) | Web API key; admin service account for custom tokens |
| Cloud Firestore | [firebase.ts](../../src/lib/firebase.ts), [firebase-admin.ts](../../src/lib/firebase-admin.ts) | Rules (client) / service account (admin) |
| Firestore Admin REST API (index create) | [deploy-firestore-indexes.ts](../../scripts/deploy-firestore-indexes.ts) | Service-account JWT, `datastore` scope |
| Firebase Security Rules API | [deploy-firestore-rules.ts](../../scripts/deploy-firestore-rules.ts) | firebase-admin `securityRules()` |
| Gmail SMTP (shared notifier) | [NotificationService.ts](../../src/services/NotificationService.ts) | `GMAIL_USER` + app password |
| Vercel Cron | [vercel.json](../../vercel.json) | `CRON_SECRET` bearer |

## Key flows

1. **Production sign-in.** `LoginForm` "Continue with Google" → `signInWithGoogle` ([useAuth.ts](../../src/modules/auth-access/ui/hooks/useAuth.ts):152) → `signInWithPopup` → if email does not end in `@activeset.co`, `signOut` and show an error (:166) → `onAuthStateChanged` sets `user`, and `isAdmin` = `accessControlService.isAdmin(email)` OR the `admin` custom claim (:133-139). `Home` ([page.tsx](../../src/app/page.tsx)) swaps `LoginForm` for the dashboard and `AppFrame` adds the rail.
2. **Localhost sign-in.** On `localhost`/`127.0.0.1` `AuthProvider` always calls `POST /api/auth/dev-token` (:114) → the route (only when not production and Host is localhost) finds or creates `local-dev@activeset.co` and returns `createCustomToken(uid, { admin: true })` → `signInWithCustomToken`. If the route returns 503 (no admin creds) or anything fails, `buildLocalDevMockUser()` gives an in-memory admin user: screens render, Firestore calls fail. `useModuleAccess` grants every module on localhost (:79).
3. **Module gate.** A page/nav item calls `useModuleAccess('proposal')` → `project-links` short-circuits to "signed in"; localhost → true; otherwise `accessControlService.hasModuleAccess` → admin → true; else read `access_control/module_access` (5-min cache in both the hook and the service) and match email or `"*"`. `useNavItems` shows locked items with a lock icon; `proposal` is hidden entirely (`hideWithoutAccess`).
4. **Authenticated API call.** Browser: `fetchAuthed(url)` / `fetchForProject(projectId, url)` ([api-client.ts](../../src/lib/api-client.ts)) attaches `Authorization: Bearer <ID token>` (+ `x-project-id`). Route: `requireCaller` verifies the ID token with firebase-admin, rejects non-`@activeset.co` (403), computes `isAdmin`; `requireModule` then checks the grant server-side ([module-access.ts](../../src/lib/module-access.ts)); `requireProjectAccess` only checks that the project doc exists; `requireAdmin` needs `isAdmin`. Catch `ApiAuthError` and return `apiAuthErrorResponse(err)`.
5. **Cron run.** Vercel calls the path with `Authorization: Bearer $CRON_SECRET` → `isCronAuthorized` ([cron-auth.ts](../../src/lib/cron-auth.ts)) → a cron that fans out to other routes builds the URL with `getRequestBaseUrl()` ([scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts)) and forwards `getCronSecretHeaders()`.
6. **Editing templates / team access.** `/modules/proposal/settings` → `useConfigurations` streams six `configurations/*` docs → an editor's Save calls `updateDoc(configurations/{docId}, { items })`. Admins see Team Access → `TeamAccessEditor` → `accessControlService.addModuleAccess/removeModuleAccess` → `setDoc(access_control/module_access)` (rules: admin only).

## Gotchas and invariants

- **Admin list lives in three places**: [AccessControlService.ts](../../src/services/AccessControlService.ts):10-13, [api-auth.ts](../../src/lib/api-auth.ts):8, [firestore.rules](../../firestore.rules):10-15. Admins are `rehan@activeset.co` and `salman@activeset.co`, plus anyone with the `admin: true` custom claim. Change all three together.
- **Domain restriction is enforced at sign-in and on the server, not in the auth listener.** `signInWithGoogle` signs non-`@activeset.co` users out (:166), but `onAuthStateChanged` accepts any user with an email (:126). The real enforcement is `requireCaller` ([api-auth.ts](../../src/lib/api-auth.ts):99) and `isActiveSetUser()` in the rules. `.endsWith('@activeset.co')` rejects the lookalike `@activeset.com`; the rules test covers this.
- **`project-links` grants are ignored.** `hasModuleAccess` returns `true` for `project-links` on both client ([AccessControlService.ts](../../src/services/AccessControlService.ts):78) and server ([module-access.ts](../../src/lib/module-access.ts):24), yet Team Access still lets you edit that list.
- **`RestrictedModule` has two definitions**: `'proposal' | 'project-links' | 'invoices'` in [AccessControlService.ts](../../src/services/AccessControlService.ts):23 and a stale `'proposal' | 'project-links'` in [module-access.ts contract](../../src/shared/contracts/module-access.ts). `NavAccess` in [nav-items.tsx](../../src/components/shell/nav-items.tsx):7 also omits `invoices`.
- **Server module check fails closed without admin creds**: `hasModuleAccess` returns `false` when `hasFirebaseAdminCredentials` is false or the doc is missing ([module-access.ts](../../src/lib/module-access.ts):26-29). The client seeds the doc only when an admin reads it.
- **`requireProjectAccess` is not per-project authorisation.** Any `@activeset.co` caller passes once the project exists ([api-auth.ts](../../src/lib/api-auth.ts):153-176). Use `requireAdmin` for admin-only data.
- **Localhost always logs you in as `local-dev@activeset.co`** (never your Google account) when admin creds are present, and that session is admin. If `.env.local` points at the production Firebase project, local writes hit production and `/api/auth/dev-token` creates a real Auth user there ([dev-token route](../../src/app/api/auth/dev-token/route.ts):45-57).
- **Local-dev API bypass**: with no admin creds, `ACTIVESET_LOCAL_DEV_API_AUTH=true` (or the `NEXT_PUBLIC_` twin), non-production, and a localhost Host header, `requireCaller` returns a fake admin caller, and `requireProjectAccess` accepts only project IDs `test-project` or `local-project-*` ([api-auth.ts](../../src/lib/api-auth.ts):36-66, 161-166). These match the localStorage project bypass in [database.ts](../../src/services/database.ts):47-69 (a fake "Revpack" project).
- **Local preview with fake env** (memory `local-preview-setup.md`, still valid): a `.env.local` with any non-empty `NEXT_PUBLIC_FIREBASE_API_KEY` stops `auth/invalid-api-key`; with no admin creds the dev-token route returns 503 and `useAuth` falls back to the mock admin user, so screens render while Firestore calls fail. The launch config is `.claude/launch.json` ("Next.js Dev Server", `/opt/homebrew/bin/node`). The repo's `.gitignore` ignores `.env*`.
- **No admin creds means silent mocks.** [firebase-admin.ts](../../src/lib/firebase-admin.ts):178-193 returns a fake `db` whose `get()` is always empty and whose writes are no-ops, and a fake `auth`. Always check `hasFirebaseAdminCredentials` before trusting a read (`appSecrets`/`projectSecrets` throw instead).
- **Import order trap for scripts**: firebase-admin reads env when its module body runs, so tsx scripts must `import '@/lib/load-env'` before anything that imports firebase-admin ([load-env.ts](../../src/lib/load-env.ts):3-23; used by `scripts/worker.ts`, `scripts/alt-text.ts`). `.env.local` is read first so Vercel's `[SENSITIVE]` placeholders in a pulled `.env.vercel-production` never override real values.
- **The deploy scripts use the opposite order**: [deploy-firestore-rules.ts](../../scripts/deploy-firestore-rules.ts):13-25 and [deploy-firestore-indexes.ts](../../scripts/deploy-firestore-indexes.ts):14-25 load `DEPLOY_ENV_FILE`, then `.env.vercel-production`, then `.env.local`, stopping at the first file that exists.
- **Index deploys**: `firebase deploy --only firestore:indexes` offers to delete live indexes missing from the file. That happened on 2026-09-20: 4 live indexes were deleted and then recreated (memory `scan-performance.md`). `deploy-firestore-indexes.ts` only POSTs creates and treats 409 as "exists", so it never deletes. Before any CLI deploy, list the live indexes and put all of them in the file.
- **Crons must not self-call via the Host header.** Vercel calls crons at the protected `*.vercel.app` deployment URL, which 302s to SSO. That silently broke the daily scan until 2026-09-20 (memory `cron-internal-urls.md`). Use `getRequestBaseUrl()` ([scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts):3-8), which prefers `NEXT_PUBLIC_BASE_URL`.
- **`CRON_SECRET` fails closed in production** ([cron-auth.ts](../../src/lib/cron-auth.ts):22-28). Outside production, an unset secret lets every caller through.
- **Two base-URL env vars.** `NEXT_PUBLIC_BASE_URL` (base-url.ts, scan dispatch, notifications) and `NEXT_PUBLIC_APP_URL` (generate-pdf, ClickUp webhook registration, Refrens, review digest, contract CLI) are both in use.
- **`configurations` is world-read/write** in the rules ([firestore.rules](../../firestore.rules):207), and `/modules/proposal/settings` has no auth check of its own ([page.tsx](../../src/app/modules/proposal/settings/page.tsx):16-19). Editors use `updateDoc` ([SimpleListEditor.tsx](../../src/app/modules/settings/components/SimpleListEditor.tsx):94 and siblings), which throws if the doc does not exist yet; seed with [seed-templates.ts](../../scripts/seed-templates.ts).
- **Legacy string agencies** get a `Math.random()` id on every snapshot until they are saved ([useConfigurations.ts](../../src/hooks/useConfigurations.ts):78-83).
- **Storage rules allow public writes** to `screenshots/**` ([storage.rules](../../storage.rules)), and `firebase.json` does not deploy them. Whatever is live was set some other way.
- **CORS is wide open on `/api/*`**: `Access-Control-Allow-Origin: *` with `Allow-Credentials: true` ([next.config.ts](../../next.config.ts):39-45). Safe only because auth uses bearer tokens, not cookies.
- **About half the API routes call no shared auth helper.** A grep at a00f91e found 66 of 124 `route.ts` files that call none of `require*`, `isCronAuthorized`, or the Raycast/extension/portal checks. Some are public by design (widget, share, portal). Check each route in its owning module doc.
- **The `/portal` theme is forced light** in `AppProviders` ([AppProviders.tsx](../../src/components/AppProviders.tsx):13-21), even though `<html>` hard-codes `className="dark"` ([layout.tsx](../../src/app/layout.tsx):54).
- **The keyboard layer is mounted on app routes only** ([AppFrame.tsx](../../src/components/shell/AppFrame.tsx):37-42). It is also mounted on the signed-out login screen at `/`, where `?` still opens the sheet.
- **Shortcut collisions**: the most recently registered shortcut wins ([shortcuts.tsx](../../src/shared/keyboard/shortcuts.tsx):211-213). Pages override shell bindings (e.g. `/` search, `c`, digit keys) by registering later. Shortcuts without a modifier are ignored while typing unless `allowInInput` is set (:198).

## Tests

- [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) — `npm run test:rules` (Firestore emulator via `firebase emulators:exec --project demo-activeset`, needs Java 11+; see [tests/README.md](../../tests/README.md)). Covers projects (incl. the `apiToken` guard, lookalike domain, admin claim), project_secrets, tasks/timelines/checklists/requests, access_control, proposals/templates, shared_proposals, proposal_comments, proposal_history, webflow_sessions, image_index and more.
- No unit tests for `api-auth.ts`, `cron-auth.ts`, `module-access.ts`, `firebase-admin.ts`, the shortcut registry or the shell.
- `npm test` runs site-monitoring domain tests twice (they are in both `test:domain` and `test:site-monitoring`). `src/services/LinkCheckerService.test.ts` is not in any script.

## Architecture: modular monolith, and how much of the code follows it

- The design in [modular-monolith.md](../architecture/modular-monolith.md): `src/app` holds only route entry points, `src/modules/<m>` holds features (`application/domain/infrastructure/server/ui/index.ts`), `src/platform` holds infra, `src/shared` holds presentation. Modules may import other modules only through `@/modules/<name>`.
- Enforcement ([eslint.config.mjs](../../eslint.config.mjs)):
  - Inside `src/modules/<m>`, ESLint bans imports of another module's internals and of the legacy shims (`@/hooks/useAuth`, `@/hooks/useModuleAccess`, `@/components/auth/LoginForm`, `@/components/navigation/AppNavigation`, `@/components/dashboard/Dashboard`, a few moved components).
  - In `src/app/**/page.tsx`, ESLint bans `@/modules/*/**` deep imports.
  - `src/app/portal/**` is exempt on purpose, so the portal page skips the client-portal barrel.
  - The module list in the config includes a non-existent `seo-engine`. It omits `internal-tools`, `invoices` and `timeline`, so those three modules get no boundary rule.
- Nothing forbids modules from importing `src/services`, `src/lib` or `src/components/*`, and they do: 75 module files import `@/lib/*`, 10 import `@/services/*`, and several import `@/components/{projects,webflow,checklist,...}`. Only 2 module files import `@/platform/*`. `src/platform` is 21 lines of re-exports.
- Size at a00f91e (ts/tsx lines):

  | Area | Lines |
  |---|---|
  | `src/modules` | ~37k |
  | `src/app` | ~31k (incl. ~14k of proposal code in `src/app/modules/proposal`) |
  | `src/components` | ~23k |
  | `src/lib` | ~18k |
  | `src/services` | ~11.5k |
  | `src/hooks` | ~1.8k |

  So roughly a third of the feature code lives in `src/modules`. Modules with real layering are delivery, client-portal, site-monitoring, timeline and invoices. `proposal`, `screenshot-runner`, `settings`, `checklists` and `webflow` are thin wrappers or barrels over legacy code. `src/modules/settings/index.ts` is imported by nothing.
- No CI runs `arch:check`. The only workflow is [publish-activeset-capture.yml](../../.github/workflows/publish-activeset-capture.yml). `lint:architecture` passes locally at a00f91e.

## Keyboard shortcuts (verified against the registry)

| Keys | Action | Registered in |
|---|---|---|
| `⌘K` / `Ctrl+K`, `/` | Command palette (signed in) | [CommandPalette.tsx](../../src/components/CommandPalette.tsx) |
| `?`, `⌘/` | Shortcut sheet | [ShortcutHelp.tsx](../../src/shared/keyboard/ShortcutHelp.tsx) |
| `g h` / `g p` / `g o` / `g s` / `g t` / `g c` | Home / Client Projects / Proposals / Screenshot Runner / Internal Tools / Checklist Creator | `NAV_ITEMS` + `RailItem` (desktop rail only; locked items disabled) |
| `⌘⇧L` | Toggle theme | `ThemeButton` in [AppRail.tsx](../../src/components/shell/AppRail.tsx) |
| `Esc` | Back to `backHref`, only when the header has `showBackButton`; inside a field it blurs | [AppNavigation.tsx](../../src/shared/ui/AppNavigation.tsx) |
| `j`/`↓`, `k`/`↑`, `g g`, `Enter`, `x` | List cursor next / prev / first / open / toggle | [useListNavigation.ts](../../src/shared/keyboard/useListNavigation.ts) |
| `1`…`n` on Home | Open the nth module (hidden from the sheet) | [page.tsx](../../src/app/page.tsx) |

Page-level bindings (Projects `n` `/` `v` `c`, project tabs `[` `]` digits `s` `c` `e`, Delivery `n` `i` `/`) are registered in `src/modules/project-links` and `src/modules/delivery` and are documented by those modules.

## Related docs

- [docs/features/keyboard-shortcuts.md](../features/keyboard-shortcuts.md) — **mostly accurate**. Omits `g g` and `x` from list navigation, and does not say that `Esc`-back only works on pages with a back button. "Home: `1`–`5`" becomes `1`–`4` when Proposals is hidden for the viewer. The `g` chords come from the rail, so they are unavailable on mobile widths.
- [docs/features/settings.md](../features/settings.md) — **partially stale**. It puts `access_control` under `configurations/` (it is the top-level collection `access_control`, doc `module_access`) and calls the editors "Auto-save" (they have an explicit "Save Changes" button). The component descriptions are otherwise usable.
- [docs/architecture/modular-monolith.md](../architecture/modular-monolith.md) — **aspirational / partially stale**. The layout and rules match the lint config, but it says `src/platform` centralises infra (it is a re-export facade), lists `internal-tools` among module owners without a lint rule, and implies migration is further along than it is (see the Architecture section).
- [tests/README.md](../../tests/README.md) — accurate for running the rules suite.
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) and [AGENTS.md](../../AGENTS.md) — **partially stale** for this area. Admin is listed as only `rehan@activeset.co`; the env list omits firebase-admin credentials, `CRON_SECRET` and `NEXT_PUBLIC_BASE_URL`; `src/app/modules/settings` is described as "Admin settings", but it only holds editor components (the page is `/modules/proposal/settings`).
- [env-vars.md](./env-vars.md) — master env var list (this pass).
