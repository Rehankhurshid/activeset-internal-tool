---
module: project-links
title: Client Projects (Project Links)
keywords: [project-links, client projects, projects, project dashboard, project detail, project card, projectsService, projectLinksRepository, links, manual links, auto links, project.links, status, current, paused, closed, paid, past, tags, retainer, maintenance, one_time, subscription, consulting, client, group by client, combined timeline, logo, favicon, people, assignees, assigneeEmails, reviewOwnerEmail, daily review, review streak, review digest, billing, billing type, adhoc, hourly rate, embed, widget, widget.js, embed iframe, audit share link, public share, publicAuditShareToken, image library, screenshots, recent projects, keyboard shortcuts, tabs, Waiting on client, Live Sync]
entry_points: [/modules/project-links, /modules/project-links/[id], /modules/project-links/clients/[client], /modules/project-links/[id]/audit/[linkId], /share/project-links/[token], /embed, /api/project/[id]]
code_roots: [src/modules/project-links, src/app/modules/project-links, src/components/projects, src/components/widget, src/services/database.ts, public/widget.js]
last_verified: 2026-09-23 @ a00f91e
---
# Client Projects (Project Links)

> The hub of the app. "Client Projects" (`/modules/project-links`) lists every client project as a card with status, tags, logo, manual links, client-portal status and the people on it; the project detail page (`/modules/project-links/[id]`) is a tabbed shell that hosts every other feature (audit, delivery, client portal, tasks, Webflow, image library, checklist, timeline, invoices). It is open to every signed-in `@activeset.co` user. This module owns the `projects` Firestore document, the manual-link list, the embeddable `widget.js` links dropdown, the legacy public audit share link, and the daily-review loop. Almost every tab's content belongs to another module doc (see the tab table below).

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Change the project list page (filters, counts, grouping) | [ProjectLinksDashboardScreen.tsx](../../src/modules/project-links/ui/screens/ProjectLinksDashboardScreen.tsx) `ProjectLinksDashboardScreen` |
| Change the search / status-filter / tag-chip toolbar | [DashboardToolbar.tsx](../../src/modules/project-links/ui/components/DashboardToolbar.tsx) `DashboardToolbar`, `StatusFilter`, `ALL_TAGS` |
| Change a project card (menu, status, tags, widget flags, delete) | [ProjectCard.tsx](../../src/components/projects/ProjectCard.tsx) `ProjectCardComponent` |
| Add / reorder / rename a project detail tab | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) `tabOptions` (l.411), `PRIMARY_DESKTOP_TAB_VALUES` (l.59), `valid` list for `?tab=` (l.76) |
| Change desktop "More" overflow / mobile tab sheet | [ProjectTabs.tsx](../../src/modules/project-links/ui/components/ProjectTabs.tsx) `DesktopTabSelector`, `MobileTabSelector`, `TabStatBadge` |
| Change project-page keyboard shortcuts | [ProjectShortcuts.tsx](../../src/modules/project-links/ui/components/ProjectShortcuts.tsx) |
| Read/write any field on a project doc from the browser | [database.ts](../../src/services/database.ts) `projectsService` (via [project-links.repository.ts](../../src/modules/project-links/infrastructure/project-links.repository.ts)) |
| Read projects server-side / from the worker | [project-admin.ts](../../src/lib/project-admin.ts) `loadProjectDocAdmin`, `loadAllProjectDocsAdmin` |
| Add a field to the `Project` type | [types/index.ts](../../src/types/index.ts) `interface Project` (l.401) |
| Change which fields the public widget endpoint returns | [api/project/[id]/route.ts](../../src/app/api/project/[id]/route.ts) `PUBLIC_FIELDS` |
| Change the manual Links tab list (drag reorder, edit, preview) | [LinkList.tsx](../../src/components/projects/LinkList.tsx), [LinkItem.tsx](../../src/components/projects/LinkItem.tsx), [AddLinkDialog.tsx](../../src/components/projects/AddLinkDialog.tsx) |
| Change the logo picker / favicon auto-fetch | [ProjectLogoDialog.tsx](../../src/components/projects/ProjectLogoDialog.tsx), [api/favicon/route.ts](../../src/app/api/favicon/route.ts) |
| Change the people / assignee picker | [ProjectPeoplePicker.tsx](../../src/components/projects/ProjectPeoplePicker.tsx), [useAssignees.ts](../../src/hooks/useAssignees.ts) |
| Change the admin billing popover | [ProjectBillingButton.tsx](../../src/components/projects/ProjectBillingButton.tsx) |
| Change daily-review logic (buckets, streak) | [review-status.ts](../../src/lib/review-status.ts), [ProjectReviewToggle.tsx](../../src/components/projects/ProjectReviewToggle.tsx), [DailyReviewBanner.tsx](../../src/components/projects/DailyReviewBanner.tsx) |
| Change the evening review email | [review-digest.ts](../../src/lib/review-digest.ts) `runReviewDigest`, cron [review-digest/route.ts](../../src/app/api/cron/review-digest/route.ts) |
| Change the embed snippet shown to the team | [EmbedDialog.tsx](../../src/modules/project-links/ui/components/EmbedDialog.tsx) |
| Change the widget injected on client staging sites | [public/widget.js](../../public/widget.js) `ProjectLinksWidget` class (l.1105) |
| Change the iframe content the widget loads | [app/embed/page.tsx](../../src/app/embed/page.tsx), [WidgetEmbedded.tsx](../../src/widget/WidgetEmbedded.tsx), [ProjectLinksWidget.tsx](../../src/components/widget/ProjectLinksWidget.tsx) |
| Change the legacy public audit share page | [share/project-links/[token]/page.tsx](../../src/app/share/project-links/[token]/page.tsx), [SharedProjectTabs.tsx](../../src/app/share/project-links/[token]/SharedProjectTabs.tsx) |
| Change the Image Library (screenshot gallery) tab | [ImageLibrary.tsx](../../src/modules/project-links/ui/components/ImageLibrary.tsx) `ImageLibrary` |
| Change "Recent opens" on the home screen | [recent-projects.ts](../../src/lib/recent-projects.ts) `recordRecentProject`, `useRecentProjects` |
| Decide who is "team" vs client for nudges | [team.ts](../../src/lib/team.ts) `isTeamMember` |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/modules/project-links` | [page.tsx](../../src/app/modules/project-links/page.tsx) → [ProjectLinksPageScreen.tsx](../../src/modules/project-links/ui/screens/ProjectLinksPageScreen.tsx) → `ProjectLinksDashboardScreen` | Title "Client Projects", heading "All Projects": count line (current · unassigned · connected · scanning · shared · waiting on client · stale), Grid/List/By Client toggles, search, status filter (All, Maintenance, Active, Paused, Closed, Paid, Waiting on client), tag chips, `DailyReviewBanner`, `ClientUpdatesBanner`, project cards. `?new=1` opens the create form. | Signed-in user (shows `LoginForm` otherwise). Module is open to everyone: `hasModuleAccess` returns true for `project-links` ([AccessControlService.ts](../../src/services/AccessControlService.ts) l.78, [module-access.ts](../../src/lib/module-access.ts) l.24). Firestore rules limit reads to `@activeset.co`. |
| `/modules/project-links/[id]` | [[id]/page.tsx](../../src/app/modules/project-links/[id]/page.tsx) → [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) | Header (Share = copy client portal link, Embed, "…" menu with legacy audit-share actions), inline-editable name and client, manual-link count badge, admin billing button, people picker, tabs (table below). `?tab=<value>` picks the initial tab. | Signed-in; shows a "Please sign in" button otherwise. No per-project access check (comment l.368). Invoices tab and billing button need `isAdmin`. |
| `/modules/project-links/clients/[client]` | [clients/[client]/page.tsx](../../src/app/modules/project-links/clients/[client]/page.tsx) → `ClientTimelineScreen` ([modules/timeline](../../src/modules/timeline/ui/screens/ClientTimelineScreen.tsx)) | Combined timeline of every project whose `client` matches (case-insensitive). Reached from "View combined timeline" in By-Client grouping. Timeline internals: see delivery doc. | Signed-in |
| `/modules/project-links/[id]/audit/[linkId]` | [audit/[linkId]/page.tsx](../../src/app/modules/project-links/[id]/audit/[linkId]/page.tsx) | Route shell only: a server component that awaits params and renders `PageAuditDetailsScreen` (`PageDetails`) from site-monitoring with `projectId` + `linkId`. All content: see [site-audit.md](./site-audit.md). | No gate in the shell; data reads need a signed-in team session (rules). |
| `/share/project-links/[token]` | [share/project-links/[token]/page.tsx](../../src/app/share/project-links/[token]/page.tsx) | Legacy read-only public share: server finds the project by `publicAuditShareToken` with firebase-admin, merges `link_audits`, shows only `source: 'auto'` links, then tabs Audit Dashboard / Tasks / Checklist / Image Library / Timeline (all `readOnly`). | Anyone with the token, unless `publicAuditShareEnabled === false`. Needs admin credentials on the deployment. |
| `/embed?projectId=…&mode=qa\|links\|checklist&theme=…&stagingUrl=…` | [embed/page.tsx](../../src/app/embed/page.tsx) → [WidgetEmbedded.tsx](../../src/widget/WidgetEmbedded.tsx) | Iframe content for `widget.js`. `mode` filters to one tab: QA Checker (`QAWidget`), Project Links (`ProjectLinksWidget`), Checklist (`ChecklistWidget`). | Public page; links tab reads the project with the client SDK, so it only works for a signed-in team session (see Gotchas). |
| `/view/[id]` | [view/[id]/page.tsx](../../src/app/view/[id]/page.tsx) | **Not this module.** Public proposal/contract viewer over `shared_proposals` (plus `opengraph-image.tsx`). See [proposal.md](./proposal.md). | Public |
| `/pages/[url]` | [pages/[url]/page.tsx](../../src/app/pages/[url]/page.tsx) | Renders `PageAuditDetailsScreen` with no props. Looks dead (see Gotchas). | — |

### Project detail tabs (every tab/section)

Tabs are defined in `tabOptions` in [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) (l.411-422). Desktop shows `audit, delivery, client, links, tasks` inline; the rest go under "More". Keys `1`-`9` jump to tabs in this order; admins' 10th tab (Invoices) is reachable only with `]`/`[`. All non-audit tabs are `next/dynamic` code-split (l.46-53). Tab badges come from subscriptions deferred until idle (l.85-111).

| # | Tab value / label | Rendered by | Badge (stat) | Owning doc |
|---|---|---|---|---|
| — | Header: Share / Embed / "…" (Copy audit share link (legacy), Regenerate audit share link, Disable audit share link) | `ProjectDetailScreen` + `EmbedDialog` + `clientPortalRepository.getLinkState` | — | project-links (share link copy logic: [client-portal.md](./client-portal.md)) |
| — | Hero: name, client, "N links" badge, billing, people | `InlineEdit`, `ProjectBillingButton`, `ProjectPeoplePicker` | — | project-links (billing consumers: [tools-and-extensions.md](./tools-and-extensions.md)) |
| 1 | `audit` "Audit Dashboard" (default) | "Sync Sitemap / Sync Webflow" button (`/api/scan-sitemap`), `ScanSitemapDialog`, collapsible "Search text across pages" `ProjectTextCheckCard`, `WebsiteAuditDashboardScreen` (from `@/modules/site-monitoring`), all fed `autoLinks` | count of `source: 'auto'` links | [site-audit.md](./site-audit.md) |
| 2 | `delivery` "Delivery" | `DeliveryTab` (`@/modules/delivery`) | pages built `done/total` from `projects/{id}/pages` | [delivery.md](./delivery.md) |
| 3 | `client` "Client" | `ClientPanel` (`@/modules/client-portal`) | client status label when portal enabled, else "Off" | [client-portal.md](./client-portal.md) |
| 4 | `links` "Links" | `AddLinkDialog` + `LinkList` with `sources={['manual']}` | count of manual links | **project-links (this doc)** |
| 5 | `tasks` "Tasks" | `TasksTab` ([components/tasks/TasksTab.tsx](../../src/components/tasks/TasksTab.tsx)) | open (not `done`) task count | [clickup-tasks.md](./clickup-tasks.md) |
| 6 | `webflow` "Webflow Pages" | `WebflowPagesDashboard` ([components/webflow](../../src/components/webflow/WebflowPagesDashboard.tsx)) + `webflowConfigRepository` save/remove | "Set" when `webflowConfig.siteId && hasApiToken` | [webflow.md](./webflow.md) |
| 7 | `images` "Image Library" | `ImageLibrary` ([ImageLibrary.tsx](../../src/modules/project-links/ui/components/ImageLibrary.tsx)) | none | project-links for the gallery; capture CLI / screenshot runner: [tools-and-extensions.md](./tools-and-extensions.md); alt text and image weight are NOT here: [worker-alt-text-images.md](./worker-alt-text-images.md) |
| 8 | `checklist` "Checklist" | `ChecklistOverview` ([components/checklist](../../src/components/checklist/ChecklistOverview.tsx)) | `completed+skipped / total` items | [delivery.md](./delivery.md) (assumed owner of checklists/SOPs; no dedicated slug) |
| 9 | `timeline` "Timeline" | `ProjectTimelineOverview` (`@/modules/timeline`) | milestone count (or phase count) | [delivery.md](./delivery.md) (assumed owner of timeline; no dedicated slug) |
| 10 | `invoices` "Invoices" (admin only) | `InvoicesTab` (`@/modules/invoices`) | none | [tools-and-extensions.md](./tools-and-extensions.md) (Refrens) |

## API routes

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| GET, OPTIONS | `/api/project/[id]` | [route.ts](../../src/app/api/project/[id]/route.ts) | none (CORS `*`) | Public project read for `widget.js`. firebase-admin; returns only `PUBLIC_FIELDS` (name, status, tags, links, client, sitemapUrl, detectedLocales, pathToLocaleMap, folderPageTypes, disableAuditBadge, disableDropdown, enableSpellcheck, publicAuditShareEnabled). |
| GET | `/api/project/[id]/checklist` | [route.ts](../../src/app/api/project/[id]/checklist/route.ts) | none | Checklist progress `{completed,total,checklists}` for the widget badge. Uses the **client SDK** server-side, which works only because `project_checklists` has `allow read: if true`. |
| GET | `/api/projects` | [route.ts](../../src/app/api/projects/route.ts) | Firebase ID token (`@activeset.co`) or extension token for slug `webflow-settings-auditor` (`requireCallerOrExtensionToken`) | Up to 100 projects ordered by `createdAt desc` (`id, name, createdAt, webflowConfig.customDomain`) for the Webflow Settings Auditor's "save to project" dropdown. Extension side: [tools-and-extensions.md](./tools-and-extensions.md). |
| GET | `/api/favicon?url=` | [route.ts](../../src/app/api/favicon/route.ts) | none | Fetches up to 80 KB of the page head (5 s timeout), picks the best `<link rel*=icon>`, falls back to `https://www.google.com/s2/favicons?domain=…&sz=128`. Used by the logo picker. |
| GET | `/api/proxy-image?url=` | [route.ts](../../src/app/api/proxy-image/route.ts) | none | Streams an external image (must be `image/*`), `Cache-Control: max-age=86400`, CORS `*`. Only caller: [social-card-preview.tsx](../../src/components/social-card-preview.tsx) (Webflow SEO previews). |
| GET | `/api/cron/review-digest` | [route.ts](../../src/app/api/cron/review-digest/route.ts) | cron secret (`isCronAuthorized`) | Emails the list of live projects not reviewed today. |

Routes this module *calls* but does not own: `POST /api/scan-sitemap` (Sync / Scan Sitemap buttons; [site-audit.md](./site-audit.md)), `POST /api/scan-bulk`, `GET /api/parse-sitemap`, `GET /api/capture-runs` (Image Library), `GET /api/clickup/members` (assignee list; [clickup-tasks.md](./clickup-tasks.md)), `/api/webflow/config` (via `webflowConfigRepository`; [webflow.md](./webflow.md)), `/api/client-portal/[projectId]/link` (via `clientPortalRepository.getLinkState`; [client-portal.md](./client-portal.md)). `widget.js` also calls `/api/audit-config`, `/api/save-audit`, `/api/check-text` ([site-audit.md](./site-audit.md)). Raycast project CRUD lives under `/api/raycast/projects/**` via [raycast-projects.ts](../../src/lib/raycast-projects.ts) ([tools-and-extensions.md](./tools-and-extensions.md)).

## Code map

### src/modules/project-links
- [index.ts](../../src/modules/project-links/index.ts): public surface. Exports `EmbedDialog`, `ImageLibrary`, `ScanSitemapDialog`, `ProjectDetailScreen`, `ProjectLinksDashboardScreen`, `ProjectLinksPageScreen`, `projectLinksRepository`, and types `CreateProjectLinkInput, Project, ProjectLink, ProjectStatus, ProjectTag`.
- [domain/project-links.types.ts](../../src/modules/project-links/domain/project-links.types.ts): re-exports those types from `@/types` (no logic).
- [infrastructure/project-links.repository.ts](../../src/modules/project-links/infrastructure/project-links.repository.ts): thin `ProjectLinksRepository` over `projectsService`: `subscribeToAllProjects`, `subscribeToProject`, `createProject`, `addLinkToProject`, `updateProjectName`, `updateProjectClient`, `updateProjectProposalId`, `updateProjectAssignees`, `createAuditShareLink`, `regenerateAuditShareLink` (`{regenerate:true}`), `disableAuditShareLink`. Also used by `ClientTimelineScreen`, `ProjectPeoplePicker`, `LinkProposalDialog` (invoices).
- [ui/screens/ProjectLinksPageScreen.tsx](../../src/modules/project-links/ui/screens/ProjectLinksPageScreen.tsx): auth gate (skeleton, `LoginForm`, or dashboard).
- [ui/screens/ProjectLinksDashboardScreen.tsx](../../src/modules/project-links/ui/screens/ProjectLinksDashboardScreen.tsx): list page. Status buckets `MAINTENANCE_TAGS`/`ACTIVE_TAGS` (l.37-38), filtering (l.127-156), By-Client grouping with waiting/stale rollups (l.160-194), counts (l.243-278), shortcuts `n / v c 1-7 j/k Enter Esc`. Also re-exported as `Dashboard` from [components/dashboard/Dashboard.tsx](../../src/components/dashboard/Dashboard.tsx) (that alias has no importers).
- [ui/screens/ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx): detail shell (default export). Handlers: `handleUpdateProjectName`, `handleUpdateProjectClient`, `handleAddProjectLink`, `handleSaveWebflowConfig`/`handleRemoveWebflowConfig`, `handleManualSitemapSync`, `handleShareAuditDashboard`, `handleRegenerateAuditShareLink`, `handleDisableAuditShareLink`, `handleShareClientLink`.
- [ui/components/DashboardToolbar.tsx](../../src/modules/project-links/ui/components/DashboardToolbar.tsx): search input, status tabs with counts, tag popover, New button.
- [ui/components/ProjectTabs.tsx](../../src/modules/project-links/ui/components/ProjectTabs.tsx): `TabOption`/`TabStat` types, `TabStatBadge` (hidden when `tone: 'unset'`), `DesktopTabSelector` (primary + "More" dropdown), `MobileTabSelector` (bottom sheet).
- [ui/components/ProjectShortcuts.tsx](../../src/modules/project-links/ui/components/ProjectShortcuts.tsx): `[`/`]` tab cycle, `1`-`9`, `s` and `c` copy client link, `e` embed; calls `recordRecentProject` on mount.
- [ui/components/EmbedDialog.tsx](../../src/modules/project-links/ui/components/EmbedDialog.tsx): shows the `<script src="https://app.activeset.co/widget.js" data-auto-inject="true" data-project-id="…">` snippet.
- [ui/components/ScanSitemapDialog.tsx](../../src/modules/project-links/ui/components/ScanSitemapDialog.tsx): "Scan Sitemap" dialog → `POST /api/scan-sitemap {projectId, sitemapUrl}`, then `window.location.reload()`.
- [ui/components/ImageLibrary.tsx](../../src/modules/project-links/ui/components/ImageLibrary.tsx) (1,652 lines): screenshot gallery combining capture runs (`/api/capture-runs?projectName=`) and audit screenshots (`auditResult.screenshotUrl`), deduped by `pageUrl::device`; groups by language (path prefix) and folder, device/width presets saved in localStorage (`activeset:image-library:*`), lightbox, "Recapture" copies an `npx @activeset/capture --project … --urls … --upload <origin>` command; empty state can start `/api/scan-bulk` with `captureScreenshots: true` or browse the sitemap via `/api/parse-sitemap`. `readOnly` hides capture CTAs (share page).

### src/components/projects
| File | Responsibility | Owner |
|---|---|---|
| [ProjectCard.tsx](../../src/components/projects/ProjectCard.tsx) | Memoized card: logo button (opens `ProjectLogoDialog`; sits beside the name link, not inside it; shows the initial if the saved logo URL fails to load), name link, status dot, "…" menu (Mark reviewed, Status submenu current/paused/closed/paid, Client status submenu when portal on, Tags checkboxes, Widget Settings: Show audit badge / Show links dropdown / Run spell checker, Delete), up to 3 manual links (`CardLinkItem`) + expand, Add Link, tags (2 + "+N"), `ClientStatusChip`, `ProjectPeoplePicker`. `detectWebsiteUrl` picks custom domain or a "live/production/website" link for favicon fetch. | project-links |
| [CardLinkItem.tsx](../../src/components/projects/CardLinkItem.tsx) | Compact link row with inline edit/delete on the card. | project-links |
| [LinkList.tsx](../../src/components/projects/LinkList.tsx) | Filterable, dnd-kit sortable list; `sources` prop filters by `source` (missing = `manual`); reorder rewrites `order` over the whole array. | project-links |
| [LinkItem.tsx](../../src/components/projects/LinkItem.tsx) | Sortable row: inline edit, delete confirm, iframe Preview dialog, open external; opens `AuditDetailDialog` when the link has an `auditResult`. | project-links |
| [AddLinkDialog.tsx](../../src/components/projects/AddLinkDialog.tsx) | Title + URL dialog; caller supplies `onAddLink`. | project-links |
| [ProjectLogoDialog.tsx](../../src/components/projects/ProjectLogoDialog.tsx) | Popover: auto-fetch favicon, paste image URL, upload (compressed client-side to 128 px data URL, `compressImage` l.153), remove. | project-links |
| [ProjectPeoplePicker.tsx](../../src/components/projects/ProjectPeoplePicker.tsx) | `ProjectPeoplePicker` (compact/hero) + `PeopleAvatarStack`. Candidates = `useAssignees()` + current + `reviewOwnerEmail`; custom email entry; optimistic save via `updateProjectAssignees`. | project-links |
| [ProjectReviewToggle.tsx](../../src/components/projects/ProjectReviewToggle.tsx) | "Mark reviewed" / undo button (pill or button); calls `markProjectReviewed` / `unmarkProjectReviewed`. | project-links |
| [DailyReviewBanner.tsx](../../src/components/projects/DailyReviewBanner.tsx) | Progress + next-up review banner over current **tagged** projects; top/bottom position in localStorage `projectLinks.dailyReviewBanner.position`. | project-links |
| [ClientUpdatesBanner.tsx](../../src/components/projects/ClientUpdatesBanner.tsx) | Nudge listing portals with no team update for > `PORTAL_STALE_AFTER_DAYS` (7). | project-links UI; rule: [client-portal.md](./client-portal.md) |
| [ProjectBillingButton.tsx](../../src/components/projects/ProjectBillingButton.tsx) | Admin popover: billing type (Fixed price / Retainer / Ad-hoc / hourly); for ad-hoc also hourly rate, currency (default USD), billed-to email, country (Refrens `billedTo` inputs). Saves via `updateProjectBilling`; non-adhoc clears the extra fields. | project-links; invoice flow: [tools-and-extensions.md](./tools-and-extensions.md) |
| [EmbedDialog.tsx](../../src/components/projects/EmbedDialog.tsx) | One-line re-export shim of the module `EmbedDialog`; no importers. | project-links |
| [ProjectStats.tsx](../../src/components/projects/ProjectStats.tsx) | "N links" + "Live" badges. No importers (dead). | project-links |
| [AuditDashboard.tsx](../../src/components/projects/AuditDashboard.tsx), [AuditDetailDialog.tsx](../../src/components/projects/AuditDetailDialog.tsx), [ProjectTextCheckCard.tsx](../../src/components/projects/ProjectTextCheckCard.tsx) | Audit UI. `AuditDashboard` has no importers; `AuditDetailDialog` is used by `LinkItem`; `ProjectTextCheckCard` is a shim over site-monitoring (the screen imports the real one directly). | [site-audit.md](./site-audit.md) |

### Widget
- [public/widget.js](../../public/widget.js) (2,802 lines, vanilla JS): `ContentQualityAuditor` (l.45, on-page QA/spellcheck; [site-audit.md](./site-audit.md)) and `ProjectLinksWidget` (l.1105). Base URL = the script's own origin. Init reads `<script data-project-id>` / `data-auto-inject="true"` or `[data-project-links-widget]` elements (l.2744-2788). Domain gate allows `*.webflow.io`, `*.framer.website`, localhost, or `showOnDomains` (l.1122-1133). Fetches `GET /api/project/{id}` and `/api/project/{id}/checklist`; honours `disableAuditBadge`, `disableDropdown`, `enableSpellcheck`; tabs load `/embed?...&mode=qa|links|checklist` iframes (l.1210-1257).
- [src/app/embed/page.tsx](../../src/app/embed/page.tsx), [src/widget/WidgetEmbedded.tsx](../../src/widget/WidgetEmbedded.tsx): iframe host; tab set filtered by `mode`.
- [src/components/widget/ProjectLinksWidget.tsx](../../src/components/widget/ProjectLinksWidget.tsx): React links panel in the iframe; subscribes via `projectsService.subscribeToProject`, shows manual links sorted by `order`, copy/edit/add/delete gated on `isAuthenticated`.
- [src/components/widget/DropdownWidget.tsx](../../src/components/widget/DropdownWidget.tsx): older React dropdown; no importers (dead).

### Services: [src/services/database.ts](../../src/services/database.ts)
Client (browser) Firestore SDK. Private helpers: `isLocalProjectBypassEnabled` (l.65), local-storage fixture helpers, `sanitizeProjectData` (l.218; strips legacy `webflowConfig.apiToken` → `hasApiToken`, normalizes `status`, drops non-array `assigneeEmails`), `normalizeProjectAssignees` (trim/lowercase/dedupe/sort), `stripUndefined`, `saveLinkAudits`/`mergeAuditResults`/`stripAuditResultsFromLinks` (audit subcollection), `getDefaultLinks` (4 blank default links).

`projectsService` exported methods (every one):

| Method | Writes / reads | Notes |
|---|---|---|
| `createProject(userId, name)` | add `projects` doc: `name, userId, status:'current', tags:[], links:getDefaultLinks(), createdAt, updatedAt` | Default links: Project Tracker, Staging Website URL, Live Website URL, Feedback URL (empty URLs, `isDefault: true`, no `source`). |
| `getAllProjects()` | all docs + every `link_audits` | No in-app callers. |
| `getUserProjects(userId)` | `where userId ==` + audits | No callers. |
| `getProject(projectId)` | doc + `link_audits` merge | Used by every read-modify-write below. |
| `updateProjectName`, `updateProjectClient` (empty deletes), `updateProjectProposalId` (null deletes), `updateProjectStatus`, `updateProjectTags` | single fields + `updatedAt` | `proposalId` set from invoices' `LinkProposalDialog`. |
| `updateProjectBilling(id, {billingType, hourlyRate, billingCurrency, billingContactEmail, billingCountry})` | billing fields; null/invalid deletes | Currency uppercased. |
| `updateProjectAssignees(id, emails)` | `assigneeEmails` (empty deletes) | normalized. |
| `updateProjectWidgetFlags(id, {disableAuditBadge, disableDropdown, enableSpellcheck})` | flags | |
| `updateProjectLogo(id, url\|null)` | `logoUrl` | May be a data URL. |
| `updateProjectSitemap`, `updateProjectLocaleData` | `sitemapUrl`; `detectedLocales`, `pathToLocaleMap` | No callers (scan-sitemap writes these with admin). |
| `deleteProject(id)` | `deleteDoc` only | Subcollections and top-level per-project data are not deleted. |
| `markProjectReviewed(id, email)` / `unmarkProjectReviewed(id)` | `lastReviewDate, lastReviewedAt, lastReviewedBy, reviewStreak` | Uses `nextStreak`; undo decrements. No local-bypass branch. |
| `setImageScanJob(id, job\|null)` | `imageScanJob` | No callers (server uses `setImageScanJobAdmin`). |
| `updateProjectLinks(id, links, {changedLinkIds?})` | audits → `link_audits/{linkId}` (compacted), then whole `links` array without `auditResult` | Falls back to inline audits if the subcollection write fails. |
| `addLinkToProject`, `updateLink`, `deleteLink` | read project → rewrite `links` | `updateLink` passes `changedLinkIds:[linkId]`. |
| `saveBrokenLinkResults(id, linkId, results)` | `auditResult.categories.links` | Called by site-monitoring UI. |
| `saveImageAltResults(id, linkId, results)` | `auditResult.categories.seo.imagesWithoutAlt`, `contentSnapshot.images` | No callers (server uses `saveImageAltResultsAdmin`). |
| `subscribeToUserProjects(userId, cb)` | listener + audit merge per fire | No callers. |
| `subscribeToAllProjects(cb)` | listener on whole collection, **no audit merge**, sorted `updatedAt desc`; error → `cb([])` | Dashboard, client timeline. |
| `subscribeToProject(id, cb)` | two listeners (doc + `link_audits`) merged in memory | Detail screen, widget, audit page. |
| `updateProjectFolderPageTypes(id, map)` | `folderPageTypes` | site-monitoring. |
| `createAuditShareLink(id, {regenerate?})` | `publicAuditShareToken` (32-hex from `randomUUID`), `publicAuditShareEnabled:true`, `publicAuditShareUpdatedAt` | Returns `${origin}/share/project-links/${token}`; reuses token unless regenerating. |
| `disableAuditShareLink(id)` | `publicAuditShareEnabled:false` | Token kept. |
| `updateClientFacing(id, patch, byEmail, {touch?})`, `markClientUpdated`, `updateClientPortalSettings`, `updateLinkClientVisibility` (transaction) | `clientFacing.*`, `clientPortal.*`, `links[].clientVisible` | Client-portal writes; see [client-portal.md](./client-portal.md). |

Also exported from the same file (owned by [clickup-tasks.md](./clickup-tasks.md)): `tasksService` (`createTask`, `createTasksBatch`, `updateTask`, `deleteTask`, `retryClickUpSync`, `subscribeToProjectTasks`) and `requestsService` (`createRequest`, `markRequestParsed`, `subscribeToProjectRequests`).

### Hooks
| Hook | What | Used by |
|---|---|---|
| [useAssignees.ts](../../src/hooks/useAssignees.ts) | Module-cached team email list: `/api/clickup/members` (via `fetchAuthed`), fallback to `access_control/module_access` emails + `ADMIN_EMAILS`. | `ProjectPeoplePicker`, `TasksTab`, `DeliveryScreen` |
| [useLastViewed.ts](../../src/hooks/useLastViewed.ts) | Returns previous-visit timestamp for a localStorage key, writes now on unmount (0 on first visit). | `TasksTab` |
| [useAsyncOperation.ts](../../src/hooks/useAsyncOperation.ts) | `{isLoading, error, execute, clearError}`; `execute` returns `null` on error. | dashboard create, `AddLinkDialog`, `LinkList`, `LinkItem` |
| [useMobile.ts](../../src/hooks/useMobile.ts) | `window.innerWidth < BREAKPOINTS.MOBILE` with resize listener. | `LinkItem`, `responsive-dialog` |
| [useDebounce.ts](../../src/hooks/useDebounce.ts), [useEditableField.ts](../../src/hooks/useEditableField.ts) | Generic helpers. | No importers (dead). |

### lib
- [project-admin.ts](../../src/lib/project-admin.ts): firebase-admin loaders without `server-only` so the worker (`scripts/worker.ts`) and CLI can import them: `loadProjectDocAdmin` (no audits), `loadAllProjectDocsAdmin`, `getWebflowTokenAdmin` (reads `project_secrets/{id}.webflowApiToken`), `linkOf`, `AdminCredentialsMissingError`. Re-exported by `audit-admin.ts`; used by `src/lib/worker/handlers/*`.
- [recent-projects.ts](../../src/lib/recent-projects.ts): localStorage `activeset:recent-projects`, max 8; `recordRecentProject`, `clearRecentProjects`, `useRecentProjects` (`useSyncExternalStore`). Consumed by [RecentProjectsPanel.tsx](../../src/components/dashboard/RecentProjectsPanel.tsx) on the home page.
- [team.ts](../../src/lib/team.ts): `isTeamMember(email)` (`@activeset.co` or `NAG_TEAM_EMAILS`), `firstNameOf`. Used by nag-bot, delivery-nudge, NotificationService.
- [review-status.ts](../../src/lib/review-status.ts): `todayIso(now?, tz?)`, `daysBetweenIso`, `daysSinceReview`, `getReviewStatus` (today/recent/stale/overdue/never), `isReviewedToday`, `nextStreak`.
- [review-digest.ts](../../src/lib/review-digest.ts): `runReviewDigest()` (server-only, nodemailer).

### types ([src/types/index.ts](../../src/types/index.ts))
`ProjectLink` (l.3), `CreateProjectLinkInput`/`UpdateProjectLinkInput` (l.198-199), `ProjectStatus` + `PROJECT_STATUS_LABELS` (l.324, 341), `ProjectTag` + `PROJECT_TAG_LABELS` (l.326, 333), `BillingType` + `BILLING_TYPE_LABELS` + `normalizeBillingType` (l.353-365), `normalizeProjectStatus` (l.367; legacy `'past'` → `'paid'`), `Project` (l.401), `ImageScanJob` (l.480), `WidgetConfig` (l.536). `WebflowConfig` is in [types/webflow.ts](../../src/types/webflow.ts) (l.121). Tones for tags/status: `PROJECT_TAG_TONES`, `PROJECT_STATUS_TONES` in `src/lib/ui-tones.ts`.

## Data model

### `projects/{projectId}` (collection name `COLLECTIONS.PROJECTS` = `'projects'`)
One document = one client project. Type `Project` ([types/index.ts](../../src/types/index.ts) l.401).

| Field | Type | Written by |
|---|---|---|
| `name`, `userId`, `createdAt`, `updatedAt` | string, string (creator uid), Timestamp | `createProject`; `updatedAt` bumped by every team write |
| `status` | `'current' \| 'paused' \| 'closed' \| 'paid'` (legacy `'past'` read as paid). UI labels: Current, Paused, Closed ("Done, payment pending"), Paid. There is no "Current/Past" pair any more. | card Status submenu, Raycast |
| `tags` | `ProjectTag[]`: retainer, one_time, subscription, maintenance, consulting | card Tags submenu, Raycast |
| `links` | `ProjectLink[]`: `{id, title, url, order, isDefault?, source?: 'manual'\|'auto', locale?, pageType?, clientVisible?}`; `auditResult` is stripped before save | manual: Links tab, card, widget, Raycast; auto: `/api/scan-sitemap` (admin) |
| `client` | string (group label) | detail hero inline edit |
| `logoUrl` | URL or data URL | `ProjectLogoDialog` |
| `assigneeEmails`, `reviewOwnerEmail` | string[] (normalized), string | people picker; `reviewOwnerEmail` has no writer in this module |
| `lastReviewDate`, `lastReviewedAt`, `lastReviewedBy`, `reviewStreak` | YYYY-MM-DD, ISO, email, number | `markProjectReviewed`, Raycast `setRaycastProjectReviewed` |
| `billingType`, `hourlyRate`, `billingCurrency`, `billingContactEmail`, `billingCountry` | see types | `ProjectBillingButton` (admin) |
| `proposalId` | string | invoices `LinkProposalDialog` |
| `disableAuditBadge`, `disableDropdown`, `enableSpellcheck` | boolean | card Widget Settings |
| `publicAuditShareToken`, `publicAuditShareEnabled`, `publicAuditShareUpdatedAt` | string, boolean, ISO | header "…" menu |
| `sitemapUrl`, `folderPageTypes`, `detectedLocales`, `pathToLocaleMap`, `imageScanJob` | audit data | [site-audit.md](./site-audit.md) |
| `webflowConfig` (`siteId, siteName?, customDomain?, lastSyncedAt?, hasApiToken?`), `sitemapIgnorePaths`, `webflowSitemapDiff` | Webflow | [webflow.md](./webflow.md) (token lives in `project_secrets`) |
| `autoOptimiseImages` (`enabled, updatedBy?, updatedAt?`) | Images screen switch; read by the hourly auto-optimise cron | [worker-alt-text-images.md](./worker-alt-text-images.md) |
| `clickupListId`, `clickupListName` | ClickUp list binding | [clickup-tasks.md](./clickup-tasks.md) |
| `clientPortal`, `clientFacing` | portal settings/status/counters | [client-portal.md](./client-portal.md) |
| `delivery` (`ProjectDeliveryState`) | stack, approvals, tracker sheet… | [delivery.md](./delivery.md) |

Reads: browser via `projectsService` (client SDK, rules require `@activeset.co` or admin or owner); server via firebase-admin (`/api/project/[id]`, share page, `project-admin.ts`, `audit-admin.ts`, `raycast-projects.ts`, crons).

Subcollections touched here: `projects/{id}/link_audits/{linkId}` (one compacted `AuditResult` per link, written by `saveLinkAudits`, merged by `subscribeToProject`/`getProject` and the share page). Other subcollections (`audit_decisions`, `alt_suggestions`, `image_budget`, `image_index`, `pages`, `portal_views`) belong to other docs.

Top-level collections read by project tabs, keyed by `projectId`: `tasks`, `requests`, `project_checklists`, `project_timelines` (all `allow read: if true`, write team-only, so the public share page can render them).

**firestore.rules** ([firestore.rules](../../firestore.rules) l.71-106): `projects` read/update/delete if admin, owner (`userId == auth.uid`) or any `@activeset.co` user; create/update must not include `webflowConfig.apiToken` (`writeHasNoApiToken`); update must keep `userId` unchanged. `link_audits` same audience. Rules tests: `tests/firestore.rules.test.ts` `describe('projects')`.

**firestore.indexes.json**: one `projects` composite index (`userId ASC, updatedAt DESC`). No current query needs it (`subscribeToUserProjects`/`getUserProjects` filter on `userId` only and have no callers); `/api/projects` orders by `createdAt` alone.

**Browser storage**: `activeset:recent-projects`, `projectLinks.dailyReviewBanner.position`, `activeset:image-library:gallery-width:v1`, `activeset:image-library:lightbox-width:v1`, `activeset.local-project-bypass.projects` (localhost fixture). No Firebase Storage paths are written by this module (logos are stored inline on the doc).

## Background jobs

| Schedule (vercel.json) | Route | What | Auth |
|---|---|---|---|
| `0 22 * * 1-5` (22:00 UTC weekdays) | `/api/cron/review-digest` | `runReviewDigest`: reads all projects with admin SDK, keeps `status == current` (missing = current) and `tags.length > 0`, lists those whose `lastReviewDate` ≠ today in `REVIEW_TIMEZONE` (default `America/New_York`), emails an HTML digest via Gmail SMTP to `REVIEW_DIGEST_EMAIL` or `NOTIFY_EMAIL`. Returns 503 when admin creds or mail config are missing. | `CRON_SECRET` via `Authorization: Bearer` or `x-cron-secret` ([cron-auth.ts](../../src/lib/cron-auth.ts)); fail-closed in production |

Other crons iterate `projects` but belong elsewhere: `daily-scan`, `scan-jobs`, `health-report` ([site-audit.md](./site-audit.md) / [site-monitoring.md](./site-monitoring.md)), `webflow-sitemap-diff` ([webflow.md](./webflow.md)), `clickup-refresh`, `nag-tasks` ([clickup-tasks.md](./clickup-tasks.md)), `refrens-sync` ([tools-and-extensions.md](./tools-and-extensions.md)), `delivery-nudge` ([delivery.md](./delivery.md)). No worker jobs or webhooks are owned here.

## Configuration

| Env var | Required? | Used in |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID` | yes (client SDK) | [lib/firebase.ts](../../src/lib/firebase.ts) |
| firebase-admin credentials (`FIREBASE_SERVICE_ACCOUNT_KEY` and alternates) | yes for `/api/project/[id]`, share page, digest, `project-admin.ts` | [lib/firebase-admin.ts](../../src/lib/firebase-admin.ts); see [platform.md](./platform.md) |
| `CRON_SECRET` | yes in prod | review-digest cron |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | yes for digest | [review-digest.ts](../../src/lib/review-digest.ts) |
| `REVIEW_DIGEST_EMAIL` (fallback `NOTIFY_EMAIL`) | one of them for digest | review-digest.ts |
| `REVIEW_TIMEZONE` | optional (default `America/New_York`) | review-digest.ts; raycast-projects.ts (falls back to `DAILY_SCAN_TIME_ZONE`) |
| `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL` | optional (digest link base; hard fallback `https://activeset-internal-tool.up.railway.app`) | review-digest.ts |
| `NAG_TEAM_EMAILS` | optional (comma list of extra team addresses) | [team.ts](../../src/lib/team.ts) |
| `NODE_ENV` | — | `isLocalProjectBypassEnabled` in database.ts |

Feature flags: per-project widget flags (`disableAuditBadge`, `disableDropdown`, `enableSpellcheck`). Admins: `isAdmin` from auth (rules hardcode `rehan@activeset.co`, `salman@activeset.co`, or `admin` claim).

## External services

| Service | How | File |
|---|---|---|
| Target websites (favicon) | server `fetch` of the site HTML, 5 s timeout, 80 KB cap; no auth | [api/favicon/route.ts](../../src/app/api/favicon/route.ts) |
| Google favicon service | fallback URL `https://www.google.com/s2/favicons?domain=…&sz=128` (returned, not fetched) | same |
| Arbitrary image hosts | server `fetch` proxy | [api/proxy-image/route.ts](../../src/app/api/proxy-image/route.ts) |
| Gmail SMTP | nodemailer with `GMAIL_USER`/`GMAIL_APP_PASSWORD` | [review-digest.ts](../../src/lib/review-digest.ts) |
| ClickUp (members) | indirectly via `/api/clickup/members` | [useAssignees.ts](../../src/hooks/useAssignees.ts) |
| Google Fonts | `widget.js` injects Funnel Display/Sans stylesheet on the client site | [public/widget.js](../../public/widget.js) |

## Key flows

1. **Create a project**: `n` or "New" → `ProjectLinksDashboardScreen.handleCreateProject` → `projectLinksRepository.createProject(user.uid, name)` → `projectsService.createProject` (`addDoc` with 4 default links, status `current`, no tags) → filter switches to "All" and tag chips clear so the untagged project is visible (l.105-109) → `subscribeToAllProjects` listener delivers it.
2. **Open a project**: card link / `Enter` → `/modules/project-links/[id]` → `ProjectDetailScreen` subscribes `projectLinksRepository.subscribeToProject(id)` (doc + `link_audits` listeners) → Audit tab renders first; badge subscriptions (tasks, timeline, delivery pages, checklists) attach on `requestIdleCallback` (timeout 2.5 s) → `ProjectShortcuts` records the project in recent opens.
3. **Add / edit / reorder a manual link**: Links tab `AddLinkDialog` → `handleAddProjectLink` → `addLinkToProject` (`getProject` → append `{source:'manual', order: links.length}` → `updateProjectLinks`). Edits go through `updateLink` (only that link's audit doc rewritten). Drag in `LinkList.handleDragEnd` renumbers `order` across the whole array and calls `updateProjectLinks` without `changedLinkIds`. The same manual links appear on the card, in `/api/project/[id]` and in the widget dropdown.
4. **Embed the widget**: header Embed (`e`) → `EmbedDialog` snippet → pasted on the staging site → `widget.js` gates by domain → `GET /api/project/{id}` (admin, allow-listed fields) + `/checklist` → renders the dropdown/badge per flags → tab iframes load `/embed?projectId=…&mode=…`.
5. **Daily review**: `DailyReviewBanner` shows current tagged projects not reviewed today (sorted never → overdue → stale → recent) → `ProjectReviewToggle` → `markProjectReviewed` (`nextStreak`) → at 22:00 UTC weekdays `/api/cron/review-digest` emails whatever is still unreviewed.
6. **Legacy audit share**: header "…" → "Copy audit share link (legacy)" → `createAuditShareLink` (reuse or mint token, set enabled) → URL copied → `/share/project-links/[token]` server-renders with admin SDK; "Regenerate" mints a new token (old link dies); "Disable" sets `publicAuditShareEnabled:false`. The header **Share** button instead copies the client portal link (`handleShareClientLink` → `clientPortalRepository.getLinkState`).

## Gotchas and invariants

- **Local bypass swaps Firestore for localStorage.** On `localhost`/`127.0.0.1` with `NODE_ENV !== 'production'` (i.e. `next dev`), most `projectsService` methods read/write `localStorage['activeset.local-project-bypass.projects']` and seed a fake "Revpack" `test-project` ([database.ts](../../src/services/database.ts) l.65-69, l.138-160). You will not see real projects in dev. Methods without a bypass branch (`markProjectReviewed`, `unmarkProjectReviewed`, `saveBrokenLinkResults`, `updateProjectFolderPageTypes`, share-link and client-portal writes) still hit real Firestore and will fail or diverge locally.
- **`project.links` is one array rewritten whole** (open structural issue from the 2026-09-20 scan-performance work). Every writer does read-modify-write of the full array: `addLinkToProject`/`updateLink`/`deleteLink` (database.ts l.848-1022), `LinkList` drag (l.75), `/api/scan-sitemap` (admin, l.745-771), Raycast `writeRaycastProjectLinks`. Concurrent writers can drop each other's link metadata. Only `updateLinkClientVisibility` uses a transaction (database.ts l.1327). Audits themselves are safe in `link_audits`. The fix (per-link docs) touches every reader of `project.links`.
- **Reorder rewrites every audit doc.** `LinkList` passes links that already carry merged `auditResult`s to `updateProjectLinks` with no `changedLinkIds`, so `saveLinkAudits` re-writes one `link_audits` doc per audited link, possibly with stale data ([LinkList.tsx](../../src/components/projects/LinkList.tsx) l.75, database.ts l.285-307). Links without an `id` get `temp_id_<idx>` (l.30), which is then persisted on reorder.
- **Never put `auditResult` on the project doc.** `updateProjectLinks` strips it to stay under Firestore's 1 MB limit; the fallback path (subscollection write failed) writes inline audits and can push a large project toward the limit (database.ts l.824-834). Logo data URLs are also inline (compressed to 128 px).
- **`subscribeToAllProjects` deliberately skips audit merge** (database.ts l.1055-1061): merging used to fetch every project's `link_audits` on every snapshot. Don't reintroduce audit data on the dashboard.
- **`sanitizeProjectData` must run on every read** (l.218): scrubs legacy `webflowConfig.apiToken`. Rules reject writes containing `apiToken` (firestore.rules l.96-104). Webflow config writes go only through `/api/webflow/config`.
- **`/api/project/[id]` is public and CORS-open**; add a field to `PUBLIC_FIELDS` only if it is safe for the world to read (route.ts l.13-30). It exposes `links` (manual and auto URLs).
- **The embed Links/Checklist iframes need a signed-in session.** `ProjectLinksWidget` reads the project with the client SDK; `projects` is not publicly readable, so for anonymous viewers `subscribeToProject`'s error handler returns `null` and the panel says "Project not found." (ProjectLinksWidget.tsx l.63-68, firestore.rules l.101).
- **EmbedDialog is out of date**: base URL is hardcoded to `https://app.activeset.co` (EmbedDialog.tsx l.18) and it says the widget appears only on `*.webflow.io`, while `widget.js` also allows `*.framer.website`, localhost and `showOnDomains` (widget.js l.1122-1133).
- **Default status filter is "Maintenance"** (dashboard l.70). "Maintenance" = current + any of retainer/maintenance/subscription; "Active" = current + one_time/consulting; untagged current projects appear only under "All". The daily-review banner and the digest also ignore untagged projects (DailyReviewBanner.tsx l.66-77, review-digest.ts l.69-70).
- **Review dates use two clocks.** The browser writes `lastReviewDate` with `todayIso()` in the viewer's local zone (database.ts l.741-743); the digest and Raycast compare against `REVIEW_TIMEZONE` (default New York). A review done late in the day from a timezone ahead of ET can show as "not reviewed" in the digest, or the reverse. The `Project.lastReviewDate` doc comment says "UTC date", which is wrong.
- **Keep the card's logo button outside the header `<Link>`** (ProjectCard.tsx). Nested inside it, the button has to `preventDefault()` its click to stop the link navigating, and Radix skips opening a trigger whose click is already `defaultPrevented` (`composeEventHandlers` in `@radix-ui/primitive`). That is how the logo picker silently stopped opening from `aad8fd1` (2026-07-10) until the logo was moved beside the link.
- **Re-labelling client status from the card must not `touch`** (ProjectCard.tsx l.143-155): `clientFacing.lastUpdateAt` drives the stale-portal nudge.
- **Delete is shallow.** `deleteProject` only deletes the doc (database.ts l.723-732). `link_audits`, `audit_decisions`, `pages`, `alt_suggestions`, `image_budget`, `image_index`, and top-level `tasks`/`project_checklists`/`project_timelines`/`requests` rows are orphaned, as is any `client_portal_tokens` entry.
- **`ScanSitemapDialog` hard-reloads the page** after a scan (l.72); the "Sync Sitemap" button does not (it relies on the listener).
- **Server routes calling the client-SDK `projectsService` likely fail under current rules.** `/api/audit-config`, `/api/save-audit`, `/api/audit`, `/api/capture-screenshot`, `/api/scan-bulk/notify` call `projectsService.getProject`/`updateLink` on the server, where the client SDK has no auth user; `projects` rules deny that (the scan-sitemap route says so in a comment at l.743-744). Owned by [site-audit.md](./site-audit.md); flagged, not verified at runtime.
- **`/api/favicon` and `/api/proxy-image` are unauthenticated server-side fetchers** of arbitrary http(s) URLs (no host allow-list, no private-IP block).
- **`/pages/[url]` never finishes loading**: it renders `PageDetails` without `projectId`/`linkId`, so the subscribe effect returns early and `loading` stays true.
- **Tab values are listed twice** in ProjectDetailScreen (`valid` l.76 and `tabOptions` l.411); a new tab must be added to both, or `?tab=` deep links (used by delivery-nudge and nag-bot emails) fall back to `audit`.

## Tests

- No unit tests cover `projectsService`, the dashboard, the detail screen, the widget or `review-status.ts`.
- Firestore rules for `projects` (signed-out denied, team/admin allowed, lookalike domain denied, `apiToken` writes denied): [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts), run with `npm run test:rules` (needs the Firebase emulator).
- `src/modules/client-portal/domain/client-portal.projection.test.ts` builds `Project` fixtures (including `reviewOwnerEmail`) but tests client-portal projection, not this module (`npm run test:client-portal`).

## Related docs

- [../features/project-links.md](../features/project-links.md): **partially stale.** Data model is outdated (no status/tags/client/people/billing/review fields); says access is controlled by `access_control` (project-links is open to all); points `ScanSitemapDialog` at `src/components/scan-sitemap-dialog.tsx` (that file exists but has no importers; the live one is in `src/modules/project-links/ui/components/`); lists `ProjectStats` and `Dashboard` as live (unused); tab description omits Delivery as a primary desktop tab; "Known limitations" (single-user projects, no scheduled scans) are no longer true. The local-bypass and widget-endpoint notes are accurate.
- [../features/keyboard-shortcuts.md](../features/keyboard-shortcuts.md): accurate for the Projects and Project shortcut groups (checked against the two screens).
- [../plans/scan-performance.md](../plans/scan-performance.md): source of the `project.links` structural-issue note; accurate on that point.
- [../features/client-portal.md](../features/client-portal.md), [../features/website-delivery.md](../features/website-delivery.md), [../features/tasks-clickup.md](../features/tasks-clickup.md), [../features/webflow-pages.md](../features/webflow-pages.md), [../features/audit-dashboard.md](../features/audit-dashboard.md): deeper docs for the tabs this shell hosts; not re-verified here.
- Sibling module docs: [platform.md](./platform.md), [site-audit.md](./site-audit.md), [site-monitoring.md](./site-monitoring.md), [webflow.md](./webflow.md), [worker-alt-text-images.md](./worker-alt-text-images.md), [client-portal.md](./client-portal.md), [delivery.md](./delivery.md), [proposal.md](./proposal.md), [clickup-tasks.md](./clickup-tasks.md), [tools-and-extensions.md](./tools-and-extensions.md).
- Note: sibling links `./site-audit.md`, `./delivery.md`, `./webflow.md`, `./platform.md`, `./tools-and-extensions.md` point at docs being written in parallel; they did not exist yet when this doc was verified.
