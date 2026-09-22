---
module: site-monitoring
title: Site Monitoring (change detection, alerts, health report, notifications)
keywords: [site monitoring, alerts, site_alerts, alert bell, anomaly, anomaly detection, AnomalyDetector, gibberish content, content degradation, mass changes, scan failed, SEO regression, word count drop, collection metadata conflict, health report, daily health, DailyHealthPanel, health_reports, scan notification, scan completion, scan_notifications, notification queue, Slack, webhook, SLACK_WEBHOOK_URL, email, Gmail, nodemailer, NOTIFY_EMAIL, change log, content_changes, change history, timeline, visual diff, screenshot, screenshot diff, pixelmatch, puppeteer, chromium, cleanup cron, daily scan, CRON_SECRET, audit dashboard, page audit details, Scan activity]
entry_points: [/, /modules/project-links/[id] (Audit tab), /modules/project-links/[id]/audit/[linkId]]
code_roots: [src/modules/site-monitoring, src/services, src/components/alerts, src/components/navigation, src/components, src/app/api/cron, src/app/api/alerts]
last_verified: 2026-09-23 @ a00f91e
---
# Site Monitoring (change detection, alerts, health report, notifications)

> What happens after and around each site scan. When a scan job finishes, the app compares every scanned page with its previous scan and raises **anomaly alerts** (stored in `site_alerts`, sent to Slack and email). It also sends a **per-project scan-completion summary**. Once a day at 04:00 UTC a **cross-project health report** is built (stored in `health_reports`, sent to Slack and email). Each scan also writes a **change log** (`content_changes`) and a full-page **screenshot** (Firebase Storage), and the page-details screen shows them as a timeline, a visual/HTML diff and a before/after screenshot diff. The ActiveSet team sees this in three places: the alert bell and the scan-activity spinner in the top nav, the "alerts" and "daily health" panels on the home page (`/`), and the per-page audit screen. `src/modules/site-monitoring` also holds the whole **Audit dashboard UI** (Pages / ALT / Links / Weight tabs, the worker panel). This doc lists that UI at code-map level only; its scanning and alt-text internals belong to the site-audit, alt-text and worker docs.

## Where to find things (quick lookup)

| I want to… | Go to |
|---|---|
| Change an anomaly rule or threshold | [AnomalyDetector.ts](../../src/services/AnomalyDetector.ts) `detectGibberishContent`, `detectContentDegradation`, `detectMassChanges`, `detectScanFailures`, `detectSEORegressions`, `detectWordCountDrops`, `detectCollectionMetadataConflicts`, entry `detectAnomalies` |
| Add a new alert type or label | [alerts.ts](../../src/types/alerts.ts) `AlertType`, `ALERT_TYPE_LABELS` |
| See what runs when a scan job completes | [ScanNotificationQueueService.ts](../../src/services/ScanNotificationQueueService.ts) `processQueuedScanNotification` |
| Find where the notification is queued | [ScanJobService.ts](../../src/services/ScanJobService.ts) (two `ensureScanNotificationQueued` calls after `releaseScanJobAfterBatch`), plus [scan-bulk/process](../../src/app/api/scan-bulk/process/route.ts) and [scan-bulk/status](../../src/app/api/scan-bulk/status/route.ts) |
| Change Slack/email message content | [NotificationService.ts](../../src/services/NotificationService.ts) `sendSlackNotification`, `sendEmailDigest`, `sendScanCompletionSlack`/`Email`, `sendHealthReportSlack`/`Email` |
| Change how Slack is delivered (webhook vs bot) | [NotificationService.ts](../../src/services/NotificationService.ts) `postSlackMessage`, `getSlackConfig` |
| Change health-report counting | [HealthReportGenerator.ts](../../src/services/HealthReportGenerator.ts) `analyzeProject`, `generateHealthReport` |
| Read/write alerts from the browser | [AlertService.ts](../../src/services/AlertService.ts) `alertService`; hook [useAlerts.ts](../../src/hooks/useAlerts.ts) |
| Nav alert bell | [AlertIndicator.tsx](../../src/components/navigation/AlertIndicator.tsx) (mounted in [AppNavigation.tsx](../../src/shared/ui/AppNavigation.tsx)) |
| Nav "scans running" spinner | [ScanActivityIndicator.tsx](../../src/components/navigation/ScanActivityIndicator.tsx) (polls `/api/scan-bulk/running-all`) |
| Home-page alert and health panels | [DashboardAlertPanel.tsx](../../src/components/alerts/DashboardAlertPanel.tsx), [DailyHealthPanel.tsx](../../src/components/alerts/DailyHealthPanel.tsx), mounted in [page.tsx](../../src/app/page.tsx) |
| Daily scan cron | [cron/daily-scan/route.ts](../../src/app/api/cron/daily-scan/route.ts) |
| Daily health report cron | [cron/health-report/route.ts](../../src/app/api/cron/health-report/route.ts) |
| Fallback notification drain | [cron/scan-jobs/route.ts](../../src/app/api/cron/scan-jobs/route.ts) (scheduled), [cron/scan-notifications/route.ts](../../src/app/api/cron/scan-notifications/route.ts) (not scheduled) |
| Prune old change log / audit logs | [cron/cleanup/route.ts](../../src/app/api/cron/cleanup/route.ts), `changeLogService.cleanupOldEntries` |
| Change-log reads/writes | [ChangeLogService.ts](../../src/services/ChangeLogService.ts) `changeLogService` |
| How the "previous scan" is rebuilt for comparison | [audit-previous.ts](../../src/lib/audit-previous.ts) `previousSummaryOf`, `previousLinksFrom`, `linksScannedSince` |
| Screenshot capture (puppeteer / @sparticuz/chromium) | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) `getScreenshotService().captureScreenshot` |
| Screenshot upload to Storage | [ScreenshotStorageService.ts](../../src/services/ScreenshotStorageService.ts) `uploadScreenshot` |
| Pixel diff of two screenshots | [image-diff.ts](../../src/lib/image-diff.ts) `compareImages`, route [compare-screenshots](../../src/app/api/compare-screenshots/route.ts) |
| HTML visual diff of the two latest audit logs | [visual-diff/route.ts](../../src/app/api/visual-diff/route.ts), [visual-diff-viewer.tsx](../../src/components/visual-diff-viewer.tsx), lib [html-diff.ts](../../src/lib/html-diff.ts) |
| Per-page change timeline UI | [change-log-timeline.tsx](../../src/components/change-log-timeline.tsx) `ChangeLogTimeline` |
| Page audit details screen | [PageAuditDetailsScreen.tsx](../../src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx) `PageDetails` |
| Audit dashboard (project Audit tab) | [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx) `WebsiteAuditDashboard` |

## User-facing pages

| URL | File | What it shows | Access |
|---|---|---|---|
| `/` | [src/app/page.tsx](../../src/app/page.tsx) | Home. The aside holds `DashboardAlertPanel` (unread, undismissed alerts, links to the project) and `DailyHealthPanel` (latest `health_reports` doc: average score, issue breakdown, per-project list) | Signed-in user (`useAuth`, @activeset.co). Data is read with the client SDK, and the rules for these collections are open |
| (every page with the nav) | [src/shared/ui/AppNavigation.tsx](../../src/shared/ui/AppNavigation.tsx) | `ScanActivityIndicator` (scans in progress) and `AlertIndicator` (bell with unread count, dropdown, mark read / mark all read) | Signed-in user |
| `/modules/project-links/[id]` → Audit tab | [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) renders `WebsiteAuditDashboardScreen` and `ProjectTextCheckCard` | Audit dashboard: Pages / ALT / Links / Weight tabs, scan controls, worker panel | Project access (project-links module) |
| `/modules/project-links/[id]/audit/[linkId]` | [page.tsx](../../src/app/modules/project-links/[id]/audit/[linkId]/page.tsx) → `PageAuditDetailsScreen` | One page: rescan, screenshot capture, visual diff / changes / HTML preview / screenshot sub-tabs, social card previews, "History" section with `ChangeLogTimeline` | Signed-in user |
| `/share/project-links/[token]` → audit tab | [SharedProjectTabs.tsx](../../src/app/share/project-links/[token]/SharedProjectTabs.tsx) | `WebsiteAuditDashboardScreen` with `isReadOnly`, which turns off decisions, alt suggestions and the worker | Share token (owned by the project-links doc) |
| `/pages/[url]` | [page.tsx](../../src/app/pages/[url]/page.tsx) | Renders `PageAuditDetailsScreen` with **no props**. Every effect bails on `!projectId`, so nothing ever loads (looks dead) | n/a |

## API routes

No middleware or proxy exists (`src/middleware.ts` and `src/proxy.ts` are both absent), so "none" below means anyone who can reach the URL can call it.

| Method | Path | File | Auth | Purpose |
|---|---|---|---|---|
| GET, PATCH | `/api/alerts` | [alerts/route.ts](../../src/app/api/alerts/route.ts) | none | GET `?unread=true&limit=N` lists alerts. PATCH `{action: markRead\|markAllRead\|dismiss, alertId}`. The `projectId` param in the doc comment is ignored. No in-repo caller (the UI uses `useAlerts` directly) |
| GET | `/api/cron/daily-scan` | [cron/daily-scan/route.ts](../../src/app/api/cron/daily-scan/route.ts) | cron secret | Starts or resumes one scan job per active project, then returns (see Background jobs) |
| GET | `/api/cron/health-report` | [cron/health-report/route.ts](../../src/app/api/cron/health-report/route.ts) | cron secret, and needs firebase-admin (503 without it) | Builds and stores the daily health report, then sends it to Slack and email |
| GET | `/api/cron/scan-jobs` | [cron/scan-jobs/route.ts](../../src/app/api/cron/scan-jobs/route.ts) | cron secret | Kicks runnable scan jobs (site-audit), **then drains the notification queue** via `processPendingScanNotifications(limit)` (default 5, max 20) |
| GET | `/api/cron/scan-notifications` | [cron/scan-notifications/route.ts](../../src/app/api/cron/scan-notifications/route.ts) | cron secret | Drains only the notification queue (`?limit`, default 10, max 25). **Not in vercel.json** |
| GET, POST | `/api/cron/cleanup` | [cron/cleanup/route.ts](../../src/app/api/cron/cleanup/route.ts) | cron secret | `?maxAgeDays=30&keepPerLink=2`: prunes `audit_logs` (`AuditService.cleanupOldAuditLogs`) and `content_changes`. **Not in vercel.json** |
| POST | `/api/scan-bulk/notify` | [scan-bulk/notify/route.ts](../../src/app/api/scan-bulk/notify/route.ts) | none | Legacy manual trigger for `sendScanCompletionNotification` for a project. No in-repo caller |
| GET | `/api/scan-bulk/debug-notifications` | [scan-bulk/debug-notifications/route.ts](../../src/app/api/scan-bulk/debug-notifications/route.ts) | none | Debug dump: last 20 `scan_notifications`, active and completed `scan_jobs`, and which Slack/Gmail env vars exist, including the first 30 characters of the webhook URL. Marked "Remove after debugging" |
| POST, OPTIONS | `/api/capture-screenshot` | [capture-screenshot/route.ts](../../src/app/api/capture-screenshot/route.ts) | none (CORS `*`) | `{projectId, linkId, url}`: captures, uploads to Storage, sets `auditResult.screenshotUrl`/`previousScreenshotUrl` on the link, and writes an `audit_logs` row |
| POST, OPTIONS | `/api/compare-screenshots` | [compare-screenshots/route.ts](../../src/app/api/compare-screenshots/route.ts) | none (CORS `*`) | `{before, after}` (URL, data URL or base64). Returns a pixelmatch diff PNG (base64) and `diffPercentage` |
| GET | `/api/visual-diff` | [visual-diff/route.ts](../../src/app/api/visual-diff/route.ts) | none | `?projectId&linkId`: HTML diff of the two most recent `audit_logs` `htmlSource`, wrapped for an iframe |
| POST | `/api/send-notification` | [send-notification/route.ts](../../src/app/api/send-notification/route.ts) | none | **Proposal area, not monitoring.** Only accepts `type: 'proposal-signed'` and emails via Gmail. Called from [proposals/[id]/sign](../../src/app/api/proposals/[id]/sign/route.ts) and `ProposalService` |

Routes this area only consumes, documented elsewhere: `/api/scan-bulk`, `/api/scan-bulk/process`, `/api/scan-bulk/status`, `/api/scan-bulk/running-all` (site-audit); `/api/audit-logs/previous` ([route](../../src/app/api/audit-logs/previous/route.ts), used by `HtmlPreview` and the page screen); `/api/proxy-image` ([route](../../src/app/api/proxy-image/route.ts), used by `social-card-preview`).

## Code map

### `src/modules/site-monitoring/` (audit UI; mostly other areas' logic)
- [index.ts](../../src/modules/site-monitoring/index.ts): public barrel. Exports `ProjectTextCheckCard`, `PageAuditDetailsScreen` (= `PageDetails`), `WebsiteAuditDashboardScreen` (= `WebsiteAuditDashboard`), `siteMonitoringRepository`, and type re-exports from `@/types`.
- `domain/`
  - [site-monitoring.types.ts](../../src/modules/site-monitoring/domain/site-monitoring.types.ts): only re-exports types from `@/types` (`ChangeLogEntry`, `FieldChange`, `BlockChange`, `TextChange`, …).
  - [audit-findings.ts](../../src/modules/site-monitoring/domain/audit-findings.ts): pure roll-up of per-page scan data into findings (`imageFingerprint`, `linkFingerprint`, `decisionId`, `imageIndexId`, `webflowAssetIdFrom`, `AltFinding`, `AuditDecision`). Audit-redesign work.
  - [image-budget.ts](../../src/modules/site-monitoring/domain/image-budget.ts): `assessImageWeight`, `retinaTarget`, thresholds (`OVERSIZE_TOLERANCE`, `MIN_SAVING_BYTES`). Worker area.
  - [image-index.ts](../../src/modules/site-monitoring/domain/image-index.ts): `ImageIndexEntry`, `optimiseSettled`, which records what was already done to each image. Worker area.
  - [webflow-assets.ts](../../src/modules/site-monitoring/domain/webflow-assets.ts): `resolveAssets`, `cmsSourceAssetIds`, `NOT_AN_ASSET_HINT`. Alt-text area.
  - [worker-control.ts](../../src/modules/site-monitoring/domain/worker-control.ts): the closed list of worker actions (`WORKER_ACTIONS`, `validateDesired`, `KNOWN_MODELS`). Worker area.
- `infrastructure/`
  - [site-monitoring.repository.ts](../../src/modules/site-monitoring/infrastructure/site-monitoring.repository.ts): thin wrapper over `projectsService` (`subscribeToProject`, `saveBrokenLinkResults`, `updateFolderPageTypes`).
  - [audit-decisions.repository.ts](../../src/modules/site-monitoring/infrastructure/audit-decisions.repository.ts): `projects/{id}/audit_decisions`.
  - [alt-suggestions.repository.ts](../../src/modules/site-monitoring/infrastructure/alt-suggestions.repository.ts): reads `projects/{id}/alt_suggestions`.
  - [image-index.repository.ts](../../src/modules/site-monitoring/infrastructure/image-index.repository.ts): reads `projects/{id}/image_index`.
  - [worker.repository.ts](../../src/modules/site-monitoring/infrastructure/worker.repository.ts): queues `worker_jobs`, watches `workers`, writes `workers/{id}/control/desired` and `workers/{id}/commands`, reads `projects/{id}/image_budget`; `isWorkerOnline` (90 s).
- `ui/screens/`
  - [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx): project Audit tab (tabs `pages`, `alt`, `links`, `weight`). Starts and polls scans (`/api/scan-bulk`, `/status`, `/cancel`, `/running`), image scans, Webflow asset writes, and link checks.
  - [PageAuditDetailsScreen.tsx](../../src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx): single-page detail. Rescan (`/api/scan-pages`), link check (`/api/check-links`), capture screenshot (`/api/capture-screenshot`), previous log (`/api/audit-logs/previous`), pixel diff (`/api/compare-screenshots`). Visual sub-tabs: `visual-diff` | `changes` | `preview` | `screenshot`. Sections: `content` | `history`.
- `ui/components/`: [ProjectTextCheckCard.tsx](../../src/modules/site-monitoring/ui/components/ProjectTextCheckCard.tsx) (searches page text across up to 150 links via `/api/project-text-check`). `audit/` holds [AuditHeader](../../src/modules/site-monitoring/ui/components/audit/AuditHeader.tsx), [AltTextTab](../../src/modules/site-monitoring/ui/components/audit/AltTextTab.tsx), [LinksTab](../../src/modules/site-monitoring/ui/components/audit/LinksTab.tsx), [WeightTab](../../src/modules/site-monitoring/ui/components/audit/WeightTab.tsx), [WorkerPanel](../../src/modules/site-monitoring/ui/components/audit/WorkerPanel.tsx), [PageFixes](../../src/modules/site-monitoring/ui/components/audit/PageFixes.tsx), [FindingPages](../../src/modules/site-monitoring/ui/components/audit/FindingPages.tsx), [relative-time.ts](../../src/modules/site-monitoring/ui/components/audit/relative-time.ts).
- `ui/hooks/`: [useAuditDecisions](../../src/modules/site-monitoring/ui/hooks/useAuditDecisions.ts), [useAltSuggestions](../../src/modules/site-monitoring/ui/hooks/useAltSuggestions.ts), [useWorker](../../src/modules/site-monitoring/ui/hooks/useWorker.ts), [useWorkerControl](../../src/modules/site-monitoring/ui/hooks/useWorkerControl.ts), [useWebflowAssetIndex](../../src/modules/site-monitoring/ui/hooks/useWebflowAssetIndex.ts), [useLibraryOptimise](../../src/modules/site-monitoring/ui/hooks/useLibraryOptimise.ts).
- Legacy shims that re-export from the module: [src/components/page-details.tsx](../../src/components/page-details.tsx), [src/components/website-audit-dashboard.tsx](../../src/components/website-audit-dashboard.tsx), [src/components/projects/ProjectTextCheckCard.tsx](../../src/components/projects/ProjectTextCheckCard.tsx).

### Components (monitoring and diff viewers)
| File | Responsibility | Used by |
|---|---|---|
| [alerts/DashboardAlertPanel.tsx](../../src/components/alerts/DashboardAlertPanel.tsx) | `DashboardAlertPanel`: home-page list of alerts, dismiss and mark read | `src/app/page.tsx` |
| [alerts/DailyHealthPanel.tsx](../../src/components/alerts/DailyHealthPanel.tsx) | `DailyHealthPanel`: `healthReportService.subscribeToLatestReport`, score ring, breakdown, projects | `src/app/page.tsx` |
| [navigation/AlertIndicator.tsx](../../src/components/navigation/AlertIndicator.tsx) | `AlertIndicator`: bell and dropdown via `useAlerts`; clicking marks read and links to `/modules/project-links/{projectId}` | `src/shared/ui/AppNavigation.tsx` |
| [navigation/ScanActivityIndicator.tsx](../../src/components/navigation/ScanActivityIndicator.tsx) | `ScanActivityIndicator`: polls `/api/scan-bulk/running-all` every 3 s while scans run, 15 s when idle, 20 s when the tab is hidden | `src/shared/ui/AppNavigation.tsx` |
| [change-log-timeline.tsx](../../src/components/change-log-timeline.tsx) | `ChangeLogTimeline`: `changeLogService.getHistory(linkId, {limit: 50})`, grouped by day | PageAuditDetailsScreen |
| [change-diff-viewer.tsx](../../src/components/change-diff-viewer.tsx) | `ChangeDiffViewer`, `ChangeSummaryBadge`: field, block and text changes | PageAuditDetailsScreen |
| [block-preview.tsx](../../src/components/block-preview.tsx) | `BlockPreview`, `BlockChangeDiff`, `BlockChangeList` | change-diff-viewer |
| [text-change-diff.tsx](../../src/components/text-change-diff.tsx) | `TextChangeDiff` | change-diff-viewer |
| [visual-diff-viewer.tsx](../../src/components/visual-diff-viewer.tsx) | `VisualDiffViewer`: iframe of `/api/visual-diff` | PageAuditDetailsScreen |
| [screenshot-diff.tsx](../../src/components/screenshot-diff.tsx) | `ScreenshotDiff` (slider, side-by-side, diff via callback), `ResponsivePreview` | PageAuditDetailsScreen |
| [html-preview.tsx](../../src/components/html-preview.tsx) | `HtmlPreview` (fetches `/api/audit-logs/previous`), `StaticHtmlPreview`, `HtmlCompareView` | PageAuditDetailsScreen |
| [social-card-preview.tsx](../../src/components/social-card-preview.tsx) | `SocialCardPreview`, `SocialPreviewTabs`: OG/Twitter/LinkedIn cards, images via `/api/proxy-image` (arguably SEO/audit, not monitoring) | PageAuditDetailsScreen |
| [source-diff-viewer.tsx](../../src/components/source-diff-viewer.tsx) | `SourceDiffViewer`: unified-diff line renderer | **no importer (dead)** |

### Hooks
- [src/hooks/useAlerts.ts](../../src/hooks/useAlerts.ts): `useAlerts()` subscribes to the latest 30 undismissed alerts and returns `unreadCount`, `markAsRead`, `markAllAsRead`, `dismissAlert`.

### Services
| File | Responsibility | SDK |
|---|---|---|
| [AlertService.ts](../../src/services/AlertService.ts) | `alertService`: `createAlerts`, `getUnreadAlerts`, `getAllAlerts`, `markAsRead`, `markAllRead` (batch), `dismissAlert`, `subscribeToAlerts` | client `firebase/firestore`, also used server-side |
| [AnomalyDetector.ts](../../src/services/AnomalyDetector.ts) | `detectAnomalies(projectId, projectName, currentLinks, previousLinks)`. Pure, returns `CreateSiteAlertInput[]` | none |
| [ScanNotificationQueueService.ts](../../src/services/ScanNotificationQueueService.ts) | `ensureScanNotificationQueued`, `processQueuedScanNotification`, `processPendingScanNotifications`, `getScanNotificationJob`. Transactional claim with a 2-minute lock | client SDK (server-side) plus `loadProjectAdmin` (admin) |
| [NotificationService.ts](../../src/services/NotificationService.ts) | All outbound email/Slack. Monitoring exports: `sendAlertNotifications`, `sendScanCompletionNotification`, `sendHealthReportNotifications`. Also hosts other areas' senders: `sendSitemapDriftNotifications` (Webflow sitemap diff), `sendInvoiceStatusEmail` (invoices), `sendDeliveryNudgeEmail`/`sendDeliveryDigestEmail` (delivery). Re-exported in part by [platform/notifications/index.ts](../../src/platform/notifications/index.ts) | nodemailer, fetch |
| [HealthReportGenerator.ts](../../src/services/HealthReportGenerator.ts) | `generateHealthReport(projects)`: pure aggregation over `link.auditResult` for `source === 'auto'` links | none |
| [HealthReportService.ts](../../src/services/HealthReportService.ts) | `healthReportService`: `createReport`, `getLatestReports`, `subscribeToLatestReport` | client SDK |
| [ChangeLogService.ts](../../src/services/ChangeLogService.ts) | `changeLogService` on `content_changes`: `saveEntry`, `getLatestEntry` (indexed, with an unbounded fallback), `getHistory`, `getProjectHistory` (unused), `getEntry`, `getEntryCount`, `deleteEntriesForLink`, `cleanupOldEntries` | client SDK |
| [ScreenshotService.ts](../../src/services/ScreenshotService.ts) | `ScreenshotService` singleton (`getScreenshotService`): `captureScreenshot` (full-page WebP q80 at 1280×800, lazy-content walk), `capturePdf` (used by `/api/generate-pdf`) | puppeteer / puppeteer-core + @sparticuz/chromium |
| [ScreenshotStorageService.ts](../../src/services/ScreenshotStorageService.ts) | `uploadScreenshot` to `screenshots/{projectId}/{linkId}/{ts}.webp`; `isScreenshotUrl`, `getScreenshotSrc` (legacy base64) | client `firebase/storage` |

Writers of `content_changes` and screenshots live in the scan pipeline (site-audit): [ScanJobService.ts](../../src/services/ScanJobService.ts), [scan-pages/route.ts](../../src/app/api/scan-pages/route.ts), [save-audit/route.ts](../../src/app/api/save-audit/route.ts). [scan-sitemap/route.ts](../../src/app/api/scan-sitemap/route.ts) calls `deleteEntriesForLink` for stale links.

### Lib
- [src/lib/audit-previous.ts](../../src/lib/audit-previous.ts): `previousSummaryOf(audit)` writes the `auditResult.previous` summary at scan time. `previousLinksFrom(links)` rebuilds the "before" links for the detector. `linksScannedSince(links, iso)` filters to this job's pages.
- [src/lib/image-diff.ts](../../src/lib/image-diff.ts): `compareImages(beforeB64, afterB64)` using pngjs and pixelmatch (threshold 0.1, pads to the larger size).
- [src/lib/slack.ts](../../src/lib/slack.ts): server-only Slack **Web API** client (`postMessage`, `lookupUserIdByEmail`, `mention`) that uses `SLACK_BOT_TOKEN`. **Not used by monitoring.** Its only importers are [nag-bot.ts](../../src/lib/nag-bot.ts) and [clickup/test-nag](../../src/app/api/clickup/test-nag/route.ts). NotificationService has its own inline Slack code.
- [src/lib/cron-auth.ts](../../src/lib/cron-auth.ts): `isCronAuthorized`, `getCronSecretHeaders`.
- [src/lib/scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts): `getRequestBaseUrl` (prefers `NEXT_PUBLIC_BASE_URL`), `triggerScanJobProcessing`.
- [src/lib/runtime-env.ts](../../src/lib/runtime-env.ts): `readEnv`, `readFirstEnv` (trimmed; empty counts as unset).
- [src/lib/html-diff.ts](../../src/lib/html-diff.ts): `computeHtmlDiff`, `wrapDiffHtml` for `/api/visual-diff`.

### Types
- [src/types/alerts.ts](../../src/types/alerts.ts): `AlertSeverity` (`critical|warning|info`), `AlertType` (7 values), `AffectedPage`, `SiteAlert`, `CreateSiteAlertInput`, `ALERT_TYPE_LABELS`.
- [src/types/health-report.ts](../../src/types/health-report.ts): `ProjectHealthSummary`, `DailyHealthReport`, `CreateDailyHealthReportInput`.
- [src/types/index.ts](../../src/types/index.ts): `ChangeLogEntry`, `ChangeLogQueryOptions`, `FieldChange`, `PreviousAuditSummary`, `AuditResult`.
- `ScanNotificationJob` / `ScanNotificationSummary` are declared inside ScanNotificationQueueService.ts.

## Data model

Collection names come from [constants.ts](../../src/lib/constants.ts) `COLLECTIONS.SITE_ALERTS='site_alerts'`, `HEALTH_REPORTS='health_reports'`, `SCAN_NOTIFICATIONS='scan_notifications'`. `content_changes` is hard-coded in ChangeLogService.

| Path | One doc = | Key fields (type, file) | Writers | Readers | SDK |
|---|---|---|---|---|---|
| `site_alerts/{auto}` | one anomaly type for one project from one completed scan | `SiteAlert` ([alerts.ts](../../src/types/alerts.ts)): `projectId, projectName, type, severity, title, message, affectedPages[], read, dismissed, createdAt (ISO), scanId?`. The detector never sets `scanId` | `ScanNotificationQueueService` → `alertService.createAlerts`. The browser writes `read`/`dismissed` | `useAlerts`, `/api/alerts` | client SDK everywhere |
| `health_reports/{auto}` | one daily cross-project report | `DailyHealthReport` ([health-report.ts](../../src/types/health-report.ts)): `date (YYYY-MM-DD), createdAt, projectCount, totalPages, avgScore, totalIssues, issueBreakdown{…}, projects: ProjectHealthSummary[]` | `/api/cron/health-report` via `healthReportService.createReport` | `DailyHealthPanel` (latest by `createdAt`) | client SDK |
| `scan_notifications/{scanId}` | the notification job for one scan job (doc id = scanId, so each scan gets at most one) | `ScanNotificationJob` (in the service): `projectId, projectName, scannedPages, totalPages, summary{noChange,techChange,contentChanged,failed}, startedAt?, status: pending\|processing\|sent\|failed, attempts, createdAt, updatedAt, sentAt?, lastAttemptAt?, processingStartedAt?, error?` | `ensureScanNotificationQueued` (ScanJobService, scan-bulk/process, scan-bulk/status); claim/sent/failed in the service | drains, `/api/scan-bulk/status` (echoes `notificationStatus`), debug route | client SDK (server-side) |
| `content_changes/{auto}` | one detected change (or first scan) for one page | `ChangeLogEntry` ([types/index.ts](../../src/types/index.ts)): `projectId, linkId, url, timestamp, changeType: FIRST_SCAN\|CONTENT_CHANGED\|TECH_CHANGE_ONLY, fieldChanges[], summary, contentSnapshot, fullHash, contentHash, auditScore?` | scan pipeline (`ScanJobService`, `scan-pages`, `save-audit`) | `ChangeLogTimeline`, `getLatestEntry` during scans | client SDK |
| `projects/{id}.links[].auditResult` | the page's latest audit (owned by project-links / site-audit) | fields read here: `score, changeStatus, lastRun, contentSnapshot{title,h1,metaDescription,wordCount,images}, categories{seo,links,spelling,openGraph,schema}, previous: PreviousAuditSummary, screenshotUrl, previousScreenshotUrl, screenshotCapturedAt` | scan pipeline; `/api/capture-screenshot` sets the screenshot fields | AnomalyDetector, HealthReportGenerator, page screen | admin (`loadProjectAdmin`/`loadAllProjectsAdmin`) in crons and queue; client in UI |
| `audit_logs/{auto}` | one saved scan with HTML and screenshot (owned by site-audit) | `screenshotUrl`, `htmlSource`, `timestamp` | scan pipeline, `/api/capture-screenshot` | `/api/visual-diff`, `/api/audit-logs/previous`, cleanup cron | via `AuditService` |

Module-owned but documented by other areas: `projects/{id}/audit_decisions`, `alt_suggestions`, `image_budget`, `image_index`, `worker_jobs`, `workers/{id}` (+ `control/desired`, `commands`).

**Storage:** `screenshots/{projectId}/{linkId}/{safeTimestamp}.webp`, uploaded with the client Storage SDK from server routes and stored as a token download URL. [storage.rules](../../storage.rules) allows public read **and `allow write: if true`** (marked TODO).

**firestore.rules** ([firestore.rules](../../firestore.rules) lines 197-201): `site_alerts`, `health_reports`, `scan_notifications`, `audit_logs`, `content_changes` are all `allow read, write: if true`. The server-side code depends on this: it uses the client SDK without auth.

**firestore.indexes.json** ([file](../../firestore.indexes.json)): `content_changes (linkId ASC, timestamp DESC)` for `getLatestEntry`; `site_alerts (dismissed, read, createdAt DESC)` for unread alerts; `site_alerts (dismissed, createdAt DESC)` for all alerts and the subscription. `scan_notifications` uses a single-field `status in […]` query, and `health_reports` orders only by `createdAt` (automatic indexes).

## Background jobs

Vercel crons ([vercel.json](../../vercel.json)). Times are UTC. All require `CRON_SECRET` via [cron-auth.ts](../../src/lib/cron-auth.ts).

| Schedule | Route | What it does for monitoring |
|---|---|---|
| `30 0 * * *` | `/api/cron/daily-scan` | For each project with `status` = `current` (default) that has at least one `source === 'auto'` link: if an active scan job exists, resume it (when `shouldKickScanJob`) or leave it alone; otherwise `createScanJob({scanCollections: true, captureScreenshots: true})` and kick `/api/scan-bulk/process` inside `waitUntil`. Returns immediately. **It does not detect anomalies or send notifications itself**; those run when each job completes |
| `*/5 * * * *` | `/api/cron/scan-jobs` | Re-kicks stalled jobs (site-audit), then `processPendingScanNotifications(limit)`. This is the **only scheduled** fallback drain |
| `0 4 * * *` | `/api/cron/health-report` | `loadAllProjectsAdmin()` with the same active filter → `generateHealthReport` → `healthReportService.createReport` → `sendHealthReportNotifications(report, getRequestBaseUrl(host))`. Sends every day, even when nothing changed |
| not scheduled | `/api/cron/scan-notifications` | Same drain as above. Only runs if triggered by hand or externally. The code comment ("one-minute timer") and older docs say otherwise |
| not scheduled | `/api/cron/cleanup` | Prunes `audit_logs` and `content_changes`. No schedule exists, so nothing is being pruned unless someone calls it |

Other areas' crons also send through NotificationService: `/api/cron/webflow-sitemap-diff` (`0 1 * * *`, sitemap drift) and `/api/cron/delivery-nudge`.

**Queue semantics** ([ScanNotificationQueueService.ts](../../src/services/ScanNotificationQueueService.ts)):
- A claim is a transaction. It skips `sent` jobs and `processing` jobs whose lock is younger than `PROCESSING_LOCK_MS` = 2 min. It sets `processing`, `attempts+1`.
- Success sets `sent` + `sentAt`; an exception sets `failed` + `error`. A `failed` job is picked up again by every drain, with **no cap on attempts**.
- A drain reads `status in [pending, failed, processing]` with limit `batchSize*3`, drops locked `processing` jobs, sorts by `createdAt`, and slices to `batchSize`.

## Configuration

| Env var | Required? | Used where |
|---|---|---|
| `CRON_SECRET` | Required in production (fail-closed) | [cron-auth.ts](../../src/lib/cron-auth.ts). Also sent on internal dispatch by `getCronSecretHeaders` |
| `NEXT_PUBLIC_BASE_URL` | Strongly recommended | `getRequestBaseUrl` ([scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts)) and links in messages. ScanNotificationQueueService and scan-bulk/notify fall back to `https://app.activeset.co`; send-notification falls back to a Railway URL |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` | Optional; all three needed for email, otherwise email is skipped | NotificationService `getEmailConfig` (via `readFirstEnv`); send-notification (`process.env.*` directly) |
| `SLACK_WEBHOOK_URL` (aliases, first non-empty wins: `SLACK_WEBHOOK`, `NOTIFICATION_SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_SLACK_WEBHOOK_URL`) | Optional | NotificationService `getSlackConfig` via `readFirstEnv` (the names are read as `process.env[name]`, so a grep for `process.env.SLACK_WEBHOOK_URL` finds nothing); debug-notifications |
| `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` | Optional; the monitoring fallback when no webhook is set | NotificationService `postSlackMessage`; also [slack.ts](../../src/lib/slack.ts) and nag-bot |
| Firebase admin credentials (`FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, …) | Required for daily-scan and health-report (503 without) and for `loadProjectAdmin` in the queue | [firebase-admin.ts](../../src/lib/firebase-admin.ts) `hasFirebaseAdminCredentials` |
| `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` | Set by the platform | ScreenshotService: when present uses puppeteer-core + @sparticuz/chromium |
| `PUPPETEER_EXECUTABLE_PATH` | Optional (local) | ScreenshotService local launch |
| `NODE_ENV` | platform | cron-auth fail-closed switch |

No feature flags. No per-project notification settings: every message goes to the single `NOTIFY_EMAIL` and a single Slack destination.

## External services

| Service | How | File | Auth |
|---|---|---|---|
| Gmail SMTP | `nodemailer.createTransport({service: 'gmail'})` per send; from-names "ActiveSet Alerts" / "ActiveSet Reports" / "ActiveSet Scans" | [NotificationService.ts](../../src/services/NotificationService.ts) | `GMAIL_USER` + app password |
| Slack Incoming Webhook | `fetch(webhookUrl, {text, blocks})` (Block Kit) | NotificationService `postSlackMessage` | URL is the secret |
| Slack Web API `chat.postMessage` | fallback when no webhook | NotificationService `postSlackMessage` | `Bearer SLACK_BOT_TOKEN` |
| Headless Chromium | puppeteer (local) or puppeteer-core + `@sparticuz/chromium` (Vercel) | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) | n/a |
| Firebase Storage | `uploadBytes` + `getDownloadURL` | [ScreenshotStorageService.ts](../../src/services/ScreenshotStorageService.ts) | open storage rules |
| Target websites | fetched by the scan (site-audit); screenshot URLs fetched in compare-screenshots | [compare-screenshots/route.ts](../../src/app/api/compare-screenshots/route.ts) | none |

## Key flows

1. **Scan completes → anomalies → alerts → notifications**
   1. The last batch in `processScanJobBatch` ([ScanJobService.ts](../../src/services/ScanJobService.ts)) calls `releaseScanJobAfterBatch`. If the job is now `completed`, it calls `ensureScanNotificationQueued({…, startedAt})`, which transactionally creates `scan_notifications/{scanId}` as `pending`.
   2. [scan-bulk/process](../../src/app/api/scan-bulk/process/route.ts) (inside `waitUntil`) calls `ensureScanNotificationQueued` again (idempotent) and immediately calls `processQueuedScanNotification(scanId)`.
   3. `processQueuedScanNotification` claims the job, then `loadProjectAdmin`, then `generateHealthReport([project])` for the per-project summary.
   4. Anomalies (errors here are logged and swallowed): `linksScannedSince(autoLinks, startedAt)` → `previousLinksFrom(scanned)` rebuilds the pre-scan links from `auditResult.previous` → `detectAnomalies(...)`. If there are any: `alertService.createAlerts`, then `sendAlertNotifications` (email digest + Slack, `Promise.allSettled`).
   5. `sendScanCompletionNotification(ctx, projectHealth)` sends Slack + email in parallel. It throws only if **both** fail; a "skipped" channel counts as success. The job is then marked `sent`, or `failed` if it threw.
   6. Fallbacks: the page's poll of [scan-bulk/status](../../src/app/api/scan-bulk/status/route.ts) re-queues and processes in `waitUntil` whenever the job is completed and the notification is not `sent`; `/api/cron/scan-jobs` drains every 5 minutes.

2. **Daily health report (04:00 UTC)**: [cron/health-report](../../src/app/api/cron/health-report/route.ts) → `loadAllProjectsAdmin` → filter active projects with auto links → `generateHealthReport` (per project: count missing meta/title/H1, broken links, spelling, OG, schema, low score < 60; ALT counted as **unique image URLs** without alt, not per page; `accessibilityErrors` is always 0 ("intentionally hidden"); top 5 worst pages) → `healthReportService.createReport` → `sendHealthReportNotifications`. The home page's `DailyHealthPanel` picks up the new doc live through `onSnapshot`.

3. **Daily scan kick-off (00:30 UTC)**: [cron/daily-scan](../../src/app/api/cron/daily-scan/route.ts) → `loadAllProjectDocsAdmin` ([audit-admin.ts](../../src/lib/audit-admin.ts)) → per project `getActiveScanJobsForProject` → resume, skip, or `createScanJob` → `triggerScanJobProcessing(getRequestBaseUrl(host), scanId)` inside `waitUntil`. Returns counts `started/resumed/alreadyRunning/failed`. Flow 1 then happens per project whenever each job finishes.

4. **Alert lifecycle in the UI**: `useAlerts` → `alertService.subscribeToAlerts({limitCount: 30})` (`dismissed == false`, newest first) → the bell's `unreadCount` = non-read among those 30 → clicking an alert calls `markAsRead` and navigates to `/modules/project-links/{projectId}`; "mark all read" batch-updates every unread, undismissed doc; the home panel's dismiss sets `dismissed: true`, which removes it from every list. Nothing ever deletes `site_alerts`.

5. **Page change history and diffs** (PageAuditDetailsScreen):
   - The "History" section shows `ChangeLogTimeline`, which reads `content_changes` by `linkId`, sorts client-side and keeps 50.
   - The "visual-diff" tab calls `/api/visual-diff`, which HTML-diffs the latest two `audit_logs`.
   - "changes" renders `ChangeDiffViewer` over `fieldChanges`/`blockChanges`/`textChanges` from `/api/audit-logs/previous`.
   - "preview" uses `HtmlPreview`.
   - "screenshot" uses `ScreenshotDiff` with previous and current screenshot URLs; "generate diff" posts both to `/api/compare-screenshots`.
   - "Capture screenshot" calls `/api/capture-screenshot`, which captures, uploads, patches `project.links[i].auditResult` and writes an `audit_logs` row.

6. **Retention** (manual only): `/api/cron/cleanup` → `changeLogService.cleanupOldEntries(maxAgeDays, keepPerLink)` reads **the whole `content_changes` collection**, keeps the newest N per link plus anything newer than the cutoff, and deletes the rest with individual `deleteDoc` calls in chunks of 500. `AuditService.cleanupOldAuditLogs` does the same for `audit_logs`.

## Gotchas and invariants

- **Internal URLs from crons must come from `NEXT_PUBLIC_BASE_URL`**, via `getRequestBaseUrl` ([scan-job-dispatch.ts:3-13](../../src/lib/scan-job-dispatch.ts)). Vercel runs crons against the protected `*.vercel.app` URL, where self-calls 302 to SSO. This silently broke the daily scan until 2026-09-20 (the long comment in [daily-scan/route.ts](../../src/app/api/cron/daily-scan/route.ts) explains it). Do not reintroduce `request.headers.get('host')`-built URLs in `src/app/api/cron`.
- **Anomaly detection is per completed job, not per cron.** It compares against `auditResult.previous` (a summary written at scan time by `previousSummaryOf`), so a detector can only use `score, changeStatus, lastRun, title, h1, metaDescription, wordCount` from the previous scan ([audit-previous.ts](../../src/lib/audit-previous.ts)). Adding a detector that needs another previous field means also adding it to `PreviousAuditSummary` and `previousSummaryOf`.
- **`startedAt` is dropped when the queue job is read back.** `docToJob` ([ScanNotificationQueueService.ts:88-111](../../src/services/ScanNotificationQueueService.ts)) does not copy `startedAt`, so `claimedJob.startedAt` is always undefined and `linksScannedSince` (line 322) returns **every** auto link. The result: anomalies are evaluated over pages the job did not rescan, and a page whose last scan dropped content will be re-reported on every later scan until it is rescanned.
- **Duplicate alerts on retry.** Alerts are created (line 329) before the completion message is sent. If both channels then fail, the job is `failed`, every drain retries it with no attempts cap, and each retry creates the same `site_alerts` again and re-sends the alert digest.
- **`collection_meta_conflict` is state, not change.** `detectCollectionMetadataConflicts` flags any CMS group (first path segment) with missing or duplicate titles/descriptions, with no comparison to the previous scan, as `critical`. It fires on every scan until the content is fixed.
- The alert Slack text says "detected during daily scan" ([NotificationService.ts:223](../../src/services/NotificationService.ts)) even for manual scans.
- **Slack precedence:** a webhook wins over bot+channel ([NotificationService.ts:60](../../src/services/NotificationService.ts)). A missing channel is "skipped", not failed. `sendScanCompletionNotification` throws only when both channels throw ([line 687](../../src/services/NotificationService.ts)), so with Slack unset and email broken the job is still marked `sent`.
- **Env reads are trimmed.** `readFirstEnv` treats a whitespace-only value as unset. Past incident (see docs/debugging): the webhook existed in Vercel but was not visible at runtime; `/api/scan-bulk/debug-notifications` was added to diagnose it.
- **Server code uses the client Firestore SDK without auth** (AlertService, HealthReportService, ChangeLogService, ScanNotificationQueueService, debug route). This works only because [firestore.rules](../../firestore.rules) lines 197-201 are `if true` for these collections. Tightening those rules will break the crons and the queue unless they move to firebase-admin first.
- **Screenshots are WebP, but the pixel diff only reads PNG.** `captureScreenshot` produces `type: 'webp'` ([ScreenshotService.ts:115](../../src/services/ScreenshotService.ts)), while `compareImages` calls `PNG.sync.read` ([image-diff.ts:24](../../src/lib/image-diff.ts)). For current screenshots `/api/compare-screenshots` will throw and return 500, and the UI's `onGenerateDiff` returns `null`. Only legacy base64 PNG screenshots can be diffed.
- The WebP encoder caps each side at 16383 px (`WEBP_MAX_DIMENSION`, [ScreenshotService.ts:41](../../src/services/ScreenshotService.ts)). Taller pages are captured at a reduced `deviceScaleFactor`, and a 0-byte result throws. Screenshot URLs keep their Storage download token on purpose (see the comment in ScreenshotStorageService.ts).
- **Unauthenticated endpoints:** `/api/alerts` (PATCH can mark all read or dismiss any alert), `/api/scan-bulk/notify` (can spam Slack/email), `/api/scan-bulk/debug-notifications` (leaks the webhook prefix and the env var names), `/api/capture-screenshot` (launches Chromium and writes to projects), `/api/compare-screenshots` (fetches any URL server-side). Storage write is also `if true` ([storage.rules:13](../../storage.rules)).
- `/api/cron/cleanup` reads the whole `content_changes` collection in one `getDocs` ([ChangeLogService.ts:245](../../src/services/ChangeLogService.ts)). It is unscheduled; if you schedule it, expect a large read bill on big collections.
- `getLatestEntry` falls back to an unbounded per-link read if the `(linkId, timestamp)` index is missing. The index is in firestore.indexes.json; keep it (see memory "scan performance": 4 live indexes were once deleted by a `firebase deploy`).
- Health report counts are not per-page for ALT: `missingAltText` is the number of **unique normalized image URLs** without alt across the project ([HealthReportGenerator.ts](../../src/services/HealthReportGenerator.ts)).
- `site_alerts` created by the detector have no `scanId` (`createAlert` in [AnomalyDetector.ts](../../src/services/AnomalyDetector.ts) never sets it), so you cannot join an alert back to its scan job.

## Tests

- No tests cover AnomalyDetector, NotificationService, ScanNotificationQueueService, HealthReportGenerator, ChangeLogService, or the screenshot/diff code.
- Module domain tests (audit findings, image budget, image index, webflow assets, worker control): [audit-findings.test.ts](../../src/modules/site-monitoring/domain/audit-findings.test.ts), [image-budget.test.ts](../../src/modules/site-monitoring/domain/image-budget.test.ts), [image-index.test.ts](../../src/modules/site-monitoring/domain/image-index.test.ts), [webflow-assets.test.ts](../../src/modules/site-monitoring/domain/webflow-assets.test.ts), [worker-control.test.ts](../../src/modules/site-monitoring/domain/worker-control.test.ts). Run with `npm run test:site-monitoring` (also part of `npm run test:domain` and `npm test`).
- Rules: `npm run test:rules` (emulator) runs [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts).

## Related docs

- [docs/features/site-monitoring.md](../features/site-monitoring.md): **partially stale.**
  - The anomaly table omits `collection_meta_conflict`.
  - The cron table implies `/api/cron/scan-notifications` and `/api/cron/cleanup` are scheduled; neither is in vercel.json.
  - Slack is described as webhook-only; the bot+channel fallback and webhook aliases are missing.
  - "Missing ALT = `seo.imagesWithoutAlt` + accessibility issues" is wrong: it counts unique images from `contentSnapshot.images`, and accessibility is always 0.
  - It references `src/components/projects/ProjectScanBadge.tsx`, which does not exist.
  - Still accurate: the durable-queue description and the base-URL and CRON_SECRET notes.
- [docs/debugging/scan-notifications-issue.md](../debugging/scan-notifications-issue.md): **stale (historical, April 2026).** It says the scan-notifications cron runs every minute (it is not scheduled), and it predates anomaly detection moving into the queue. Useful only for the env-visibility incident history.
- [docs/features-to-be-developed/scan-notifications-debugging.md](../features-to-be-developed/scan-notifications-debugging.md): **stale.** It describes a `runBulkScan()` fire-and-forget design, `ProjectScanBadge`, and the daily cron awaiting scans; all were replaced by durable `scan_jobs` + `scan_notifications`. Its "remaining solution" (a Firestore pending-notification queue) is what now exists.
- [docs/features/audit-dashboard.md](../features/audit-dashboard.md), [docs/plans/audit-redesign.md](../plans/audit-redesign.md), [docs/features/alt-text.md](../features/alt-text.md), [docs/features/worker.md](../features/worker.md): owners of the audit-UI, alt-text and worker parts of `src/modules/site-monitoring`. Not re-verified here.
