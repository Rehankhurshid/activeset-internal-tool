---
module: site-audit
title: Site Audit (page scans, bulk scans, Audit Dashboard)
keywords: [audit, site audit, Audit Dashboard, Audit tab, scan, rescan, bulk scan, Scan all pages, daily scan, nightly scan, scan job, scan_jobs, scan queue, sitemap, sync sitemap, Scan Sitemap, discover pages, auto links, source auto, pageType, CMS, collection, static, folderPageTypes, locale, hreflang, PageScanner, link checker, broken links, dead links, unverifiable, could not verify, bot-blocked, 999, LinkCheckerService, check links, Check all pages, alt text, missing alt, decorative, Scan Images, image scan, image-scan workflow, findings, Fixes, fix roll-up, template fix pending, Fix needed, Blocked, Ready, readiness, audit_decisions, fixed_unverified, verified, regressed, ignored, audit_logs, link_audits, content_changes, change log, NO_CHANGE, TECH_CHANGE_ONLY, CONTENT_CHANGED, SCAN_FAILED, fullHash, contentHash, diff, visual diff, screenshot, Jev, TypeSafe, judgment, page judgment, spellcheck, LanguageTool, nspell, Search text across pages, text check, fonts, scan-fonts, save-audit, widget audit]
entry_points: [/modules/project-links/[id]?tab=audit, /modules/project-links/[id]/audit/[linkId], /share/project-links/[token]]
code_roots: [src/app/api/scan-pages, src/app/api/scan-bulk, src/app/api/scan-sitemap, src/services/PageScanner.ts, src/services/ScanJobService.ts, src/services/LinkCheckerService.ts, src/lib/scan-utils.ts, src/lib/audit-admin.ts, src/modules/site-monitoring/ui, src/modules/site-monitoring/domain/audit-findings.ts]
last_verified: 2026-09-23 @ a00f91e
---
# Site Audit (page scans, bulk scans, Audit Dashboard)

> The team-facing website QA pipeline. Pages are discovered from a sitemap (or the Webflow Pages API) and stored as `source: 'auto'` links on the project. Each page is scanned server-side: fetched with a bot User-Agent, parsed once with cheerio (`PageScanner`), its links checked (`LinkCheckerService`), optionally judged by TypeSafe's Jev model, and screenshotted when content changed. The result lands in `projects/{id}/link_audits/{linkId}`, a full-HTML history row in `audit_logs`, and a structured change row in `content_changes`. Scans run one page at a time from the page-details screen, in bulk as a durable, self-retriggering `scan_jobs` queue (manual button or the 00:30 UTC daily cron), and as image-only passes for alt-text checks. The UI is the **Audit Dashboard** tab on a project (`/modules/project-links/[id]?tab=audit`) with Pages / Alt text / Links / Weight sub-tabs sharing one findings roll-up, plus a per-page detail screen (`/modules/project-links/[id]/audit/[linkId]`). Team decisions on findings (decorative, ignored, fixed, verified) persist in `projects/{id}/audit_decisions`.

## Where to find things (quick lookup)

| I want to… | Go to |
| --- | --- |
| Change what one page scan measures (SEO, schema, OG, a11y, placeholders, score) | [PageScanner.ts](../../src/services/PageScanner.ts) `PageScanner.scan` |
| Change how the overall score / `canDeploy` is computed | [PageScanner.ts](../../src/services/PageScanner.ts) `scan` (score block near the end; `canDeploy = !hasPlaceholders`) |
| Change how "changed / tech-only / no change" is decided | [scan-utils.ts](../../src/lib/scan-utils.ts) `computeChangeStatus`; hashes built in `PageScanner.scan` (`fullHash`, `contentHash`) |
| Change what is kept in the stored audit doc (size limits) | [scan-utils.ts](../../src/lib/scan-utils.ts) `AUDIT_COMPACT_LIMITS`, `compactAuditResult` |
| Change the single-page rescan | [scan-pages/route.ts](../../src/app/api/scan-pages/route.ts) `POST` |
| Change the bulk scan worker (batch size, concurrency, lock) | [ScanJobService.ts](../../src/services/ScanJobService.ts) `processScanJobBatch`, `scanSinglePage`, `PAGES_PER_BATCH`, `PARALLEL_CONCURRENCY`, `PROCESSING_LOCK_MS` |
| Start / poll / cancel a bulk scan | [scan-bulk/route.ts](../../src/app/api/scan-bulk/route.ts), [status](../../src/app/api/scan-bulk/status/route.ts), [cancel](../../src/app/api/scan-bulk/cancel/route.ts) |
| Change how the queue re-triggers itself | [scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts) `triggerScanJobProcessing`, `getRequestBaseUrl`; [scan-bulk/process/route.ts](../../src/app/api/scan-bulk/process/route.ts) |
| Change which projects the nightly scan covers | [cron/daily-scan/route.ts](../../src/app/api/cron/daily-scan/route.ts) |
| Change link-check verdicts (broken vs unverifiable), timeouts, cache | [LinkCheckerService.ts](../../src/services/LinkCheckerService.ts) `classifyStatus`, `checkBrokenLinks`, `DEFAULT_OPTIONS`; [LinkCheckCache.ts](../../src/services/LinkCheckCache.ts) |
| Change sitemap discovery / stale-page removal / CMS-vs-static typing | [scan-sitemap/route.ts](../../src/app/api/scan-sitemap/route.ts) `POST`, `detectPageType`, `fetchWebflowSyncData` |
| Change staging-vs-live URL remapping for scans | [scan-target-url.ts](../../src/lib/scan-target-url.ts) `resolveScanTargetUrl` |
| Change the Jev questions / thresholds | [jev-qa.ts](../../src/lib/jev-qa.ts) `judgePage`, `JEV_THRESHOLDS`; client-safe mirror in [page-judgment.ts](../../src/lib/page-judgment.ts) |
| Change when a page is re-judged | [page-judgment.ts](../../src/lib/page-judgment.ts) `shouldJudgePage`, `JUDGMENT_MAX_AGE_MS`; [PageJudgmentService.ts](../../src/services/PageJudgmentService.ts) |
| Change how findings are grouped / page readiness | [audit-findings.ts](../../src/modules/site-monitoring/domain/audit-findings.ts) `collectFindings`, `fixesRollup`, `readinessOf` |
| Change decision persistence | [audit-decisions.repository.ts](../../src/modules/site-monitoring/infrastructure/audit-decisions.repository.ts), [useAuditDecisions.ts](../../src/modules/site-monitoring/ui/hooks/useAuditDecisions.ts) |
| Change the Audit Dashboard (tabs, filters, bulk scan UI) | [WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx) `WebsiteAuditDashboard` |
| Change the header / Fixes table | [AuditHeader.tsx](../../src/modules/site-monitoring/ui/components/audit/AuditHeader.tsx) |
| Change the Alt text / Links tabs | [AltTextTab.tsx](../../src/modules/site-monitoring/ui/components/audit/AltTextTab.tsx), [LinksTab.tsx](../../src/modules/site-monitoring/ui/components/audit/LinksTab.tsx) |
| Change the per-page detail screen | [PageAuditDetailsScreen.tsx](../../src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx) `PageDetails` |
| Change the Judgment panel on page details | [page-judgment.tsx](../../src/components/page-judgment.tsx) `PageJudgmentContent`, `pageJudgmentHealth` |
| Change image-only scans (alt text) | [scan-images/route.ts](../../src/app/api/scan-images/route.ts), [image-scan.ts workflow](../../src/workflows/image-scan.ts), [audit-admin.ts](../../src/lib/audit-admin.ts) `saveImageAltResultsAdmin` |
| Change "Search text across pages" | [ProjectTextCheckCard.tsx](../../src/modules/site-monitoring/ui/components/ProjectTextCheckCard.tsx) → [project-text-check/route.ts](../../src/app/api/project-text-check/route.ts) → [website-text-check.ts](../../src/lib/website-text-check.ts) |
| Change audit history reads | [AuditService.ts](../../src/services/AuditService.ts) `getLatestAuditLog`, `getRecentAuditLogs`; [audit-logs/previous/route.ts](../../src/app/api/audit-logs/previous/route.ts) |

## User-facing pages

| URL | File | What it shows | Access |
| --- | --- | --- | --- |
| `/modules/project-links/[id]?tab=audit` (default tab) | [page.tsx](../../src/app/modules/project-links/[id]/page.tsx) → [ProjectDetailScreen.tsx](../../src/modules/project-links/ui/screens/ProjectDetailScreen.tsx) → `WebsiteAuditDashboardScreen` | "Audit Dashboard" tab: collapsible "Search text across pages" card, header with Fixes roll-up, sub-tabs Pages / Alt text / Links / Weight, bulk-scan controls, folder CMS/Static editor | Signed-in user (`useAuth`); data via client SDK, so Firestore rules (`@activeset.co`, admin, or project owner) apply |
| `/modules/project-links/[id]/audit/[linkId]` | [page.tsx](../../src/app/modules/project-links/[id]/audit/[linkId]/page.tsx) → `PageAuditDetailsScreen` | One page: score ring, Judgment, SEO, Links, Content quality, Headings, Schema, Social previews, Technical; Rescan / Check links / Capture screenshot; visual diff, field changes, HTML preview, screenshot diff, change-log timeline | No auth check in the screen; the project subscription is rules-gated, so a signed-out viewer sees nothing |
| `/share/project-links/[token]` | [page.tsx](../../src/app/share/project-links/[token]/page.tsx) → [SharedProjectTabs.tsx](../../src/app/share/project-links/[token]/SharedProjectTabs.tsx) | Read-only Audit Dashboard (`isReadOnly`): header and fix list, no action buttons, no decisions (rules are team-only). Token is created by "Share audit dashboard" (`projectsService.createAuditShareLink`) | Share token; server reads `link_audits` with firebase-admin |
| `/pages/[url]` | [page.tsx](../../src/app/pages/[url]/page.tsx) | Renders `PageAuditDetailsScreen` with no props (see Gotchas: looks dead) | — |

Also mounted elsewhere: `AuditDetailDialog` (per-link category breakdown modal) from [LinkItem.tsx](../../src/components/projects/LinkItem.tsx); `QAWidget`/`QAChecklist` inside the embedded widget ([WidgetEmbedded.tsx](../../src/widget/WidgetEmbedded.tsx)); `ScanActivityIndicator` in the nav polls running scans.

## API routes

No route in this area uses `requireCaller`/`requireProjectAccess` from [api-auth.ts](../../src/lib/api-auth.ts), and there is no `middleware.ts`/`proxy.ts`. "None" below means anyone who knows a `projectId` / `scanId` can call it.

| Method | Path | File | Auth | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/scan-sitemap` | [route.ts](../../src/app/api/scan-sitemap/route.ts) | None | Fetch sitemap (or Webflow pages when `useWebflowFallback`), remap to staging host, add new `auto` links, drop stale `auto` links (+ their `audit_logs`/`content_changes`), set `pageType`, save `sitemapUrl`, `folderPageTypes`, `detectedLocales`, `pathToLocaleMap`. firebase-admin |
| GET | `/api/parse-sitemap?url=` | [route.ts](../../src/app/api/parse-sitemap/route.ts) | None | Recursive sitemap-index parse, returns entries with path + lang. Used by Image Library |
| GET | `/api/sitemap-links?url=` | [route.ts](../../src/app/api/sitemap-links/route.ts) | None | Flat `<loc>` list. Used by Screenshot Runner |
| POST, OPTIONS | `/api/scan-pages` | [route.ts](../../src/app/api/scan-pages/route.ts) | None (CORS `*`) | Full scan of one page `{projectId, linkId, url}`; persists via `saveScannedLinkAdmin`. `maxDuration` 120 |
| POST, OPTIONS | `/api/scan-bulk` | [route.ts](../../src/app/api/scan-bulk/route.ts) | None (CORS `*`) | Create a `scan_jobs` doc for `auto` links (`options.scanCollections` default false, `captureScreenshots` default true, optional `linkIds`) and kick `/process`. 409 + job info if one is active |
| POST | `/api/scan-bulk/process` | [route.ts](../../src/app/api/scan-bulk/process/route.ts) | Cron secret (`isCronAuthorized`) | Run one batch in `waitUntil`, re-POST itself while `running`; on completion queue + send the scan notification. `maxDuration` 300 |
| GET, OPTIONS | `/api/scan-bulk/status?scanId=` | [route.ts](../../src/app/api/scan-bulk/status/route.ts) | None | Job progress; kicks a stalled job; queues/sends the completion notification if not yet `sent` |
| GET, OPTIONS | `/api/scan-bulk/running?projectId=` | [route.ts](../../src/app/api/scan-bulk/running/route.ts) | None | Active jobs for a project (dashboard resume on mount) |
| GET, OPTIONS | `/api/scan-bulk/running-all` | [route.ts](../../src/app/api/scan-bulk/running-all/route.ts) | None | All active jobs (nav `ScanActivityIndicator`) |
| POST, OPTIONS | `/api/scan-bulk/cancel` | [route.ts](../../src/app/api/scan-bulk/cancel/route.ts) | None | Transactionally mark job `cancelled` |
| POST | `/api/scan-bulk/notify` | [route.ts](../../src/app/api/scan-bulk/notify/route.ts) | None | Legacy manual completion notification. No in-repo caller |
| GET | `/api/scan-bulk/debug-notifications` | [route.ts](../../src/app/api/scan-bulk/debug-notifications/route.ts) | None | Debug dump of `scan_notifications`, jobs, Slack env presence ("Remove after debugging"). No caller |
| POST, OPTIONS | `/api/scan-images` | [route.ts](../../src/app/api/scan-images/route.ts) | None | Image-only scan of one page; writes `imagesWithoutAlt`, `imageScanCheckedAt`, snapshot images. Used for Scan Images and alt Verify. firebase-admin, `maxDuration` 60 |
| POST, OPTIONS | `/api/image-scan/start` | [route.ts](../../src/app/api/image-scan/start/route.ts) | None | Start durable `imageScanWorkflow` over `{projectId, pages[]}`; 409 if `project.imageScanJob` running and heartbeat < 2 min old |
| POST, OPTIONS | `/api/image-scan/cancel` | [route.ts](../../src/app/api/image-scan/cancel/route.ts) | None | Cancel the workflow run, clear `project.imageScanJob` |
| POST | `/api/check-links` | [route.ts](../../src/app/api/check-links/route.ts) | None | Re-scan a page and check its links; returns broken + unverifiable. Does not persist (the browser persists via `projectsService.saveBrokenLinkResults`) |
| POST | `/api/project-text-check` | [route.ts](../../src/app/api/project-text-check/route.ts) | None | Search up to 150 pages (concurrency 4) for a phrase ≤ 300 chars |
| POST, OPTIONS | `/api/check-text` | [route.ts](../../src/app/api/check-text/route.ts) | None | Spellcheck: LanguageTool (`LANGUAGETOOL_URL` or public API), or nspell when `useNspell`. Called by the embed widget and `spellChecker.ts` |
| POST, OPTIONS | `/api/save-audit` | [route.ts](../../src/app/api/save-audit/route.ts) | None | Widget-side audit sync from [public/widget.js](../../public/widget.js). Uses browser SDK server-side (see Gotchas) |
| POST, OPTIONS | `/api/audit-config` | [route.ts](../../src/app/api/audit-config/route.ts) | None | Widget cost control: spellcheck off when `project.enableSpellcheck === false` or the first path folder has > 20 links |
| POST | `/api/audit` | [route.ts](../../src/app/api/audit/route.ts) | None | Gemini (`gemini-flash-latest`) proofread of posted text; optionally writes `auditResult` via browser SDK. No in-repo caller |
| GET, OPTIONS | `/api/audit-logs/previous?projectId=&linkId=` | [route.ts](../../src/app/api/audit-logs/previous/route.ts) | None | Latest two `audit_logs` rows (HTML, screenshot, blocks, textElements) for diffs |
| GET | `/api/qa/scan-fonts?url=` | [route.ts](../../src/app/api/qa/scan-fonts/route.ts) | None | `PageScanner.scanFonts`: list fonts, flag non-WOFF2. Used by `QAWidget` "Upload Fonts" check |
| GET | `/api/cron/scan-jobs` | [route.ts](../../src/app/api/cron/scan-jobs/route.ts) | Cron secret | Recovery: kick up to `?limit` (default 5, max 20) runnable jobs; drain pending scan notifications |
| GET, POST | `/api/cron/cleanup?maxAgeDays=&keepPerLink=` | [route.ts](../../src/app/api/cron/cleanup/route.ts) | Cron secret | Manual only (not in vercel.json): `cleanupOldAuditLogs` (default 30 days, keep 2 per link). Reads the whole `audit_logs` collection |
| GET | `/api/cron/daily-scan` | [route.ts](../../src/app/api/cron/daily-scan/route.ts) | Cron secret | Create one scan job per `status: 'current'` project with `auto` links (collections included), or resume a stalled one; return immediately |

Supporting routes used by the page-details screen (not primarily this area): `POST /api/capture-screenshot`, `POST /api/compare-screenshots` (pixel diff via [image-diff.ts](../../src/lib/image-diff.ts)), `GET /api/visual-diff` ([html-diff.ts](../../src/lib/html-diff.ts)), `GET /api/proxy-image`. Alt Save/Publish call `PATCH /api/webflow/assets/[assetId]` and `POST /api/webflow/sites/[siteId]` with `fetchForProject` (Firebase ID token) — Webflow area.

## Code map

### Module: `src/modules/site-monitoring` (audit parts)
- [index.ts](../../src/modules/site-monitoring/index.ts) — exports `PageAuditDetailsScreen`, `WebsiteAuditDashboardScreen`, `ProjectTextCheckCard`, `siteMonitoringRepository`, audit types.
- [domain/audit-findings.ts](../../src/modules/site-monitoring/domain/audit-findings.ts) — pure. `imageFingerprint`, `linkFingerprint`, `decisionId` (FNV-1a hash, `alt_`/`link_`/`weight_` prefix), `webflowAssetIdFrom`, `collectFindings` (one `AltFinding` per image asset, one `LinkFinding` per dead URL, `UnverifiableLink`s, blocked/failed pages), `fixesRollup`, `findingsForPage`, `readinessOf`, `READINESS_LABEL`, `fixListMarkdown`, `isLikelyDecorative` (`LIKELY_DECORATIVE_AT` 0.75).
- [domain/site-monitoring.types.ts](../../src/modules/site-monitoring/domain/site-monitoring.types.ts) — re-exports audit types from `@/types`.
- [infrastructure/audit-decisions.repository.ts](../../src/modules/site-monitoring/infrastructure/audit-decisions.repository.ts) — client-SDK subscribe/record/clear on `projects/{id}/audit_decisions`.
- [infrastructure/site-monitoring.repository.ts](../../src/modules/site-monitoring/infrastructure/site-monitoring.repository.ts) — thin wrapper: `subscribeToProject`, `saveBrokenLinkResults`, `updateFolderPageTypes` over `projectsService`.
- [ui/hooks/useAuditDecisions.ts](../../src/modules/site-monitoring/ui/hooks/useAuditDecisions.ts) — live decisions + `record`/`clear` with toasts.
- [ui/screens/WebsiteAuditDashboardScreen.tsx](../../src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx) — `WebsiteAuditDashboard`: pages table (fixed six-column layout from `md` up; below `md` automatic layout with two columns — page with status · last scan folded underneath, and score; tapping a row opens it), filters (status/locale/type/sort), locale → folder grouping, folder type editor, bulk scan start/poll/cancel/resume, Scan Images (single + durable all-site), alt Save/Mark fixed/Decorative/Verify/Publish, link Ignore/Recheck/Check all (3 parallel, browser loop).
- [ui/screens/PageAuditDetailsScreen.tsx](../../src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx) — `PageDetails({projectId, linkId})`.
- [ui/components/audit/AuditHeader.tsx](../../src/modules/site-monitoring/ui/components/audit/AuditHeader.tsx) — "can this ship" + Fixes table; `FixTarget`.
- [ui/components/audit/AltTextTab.tsx](../../src/modules/site-monitoring/ui/components/audit/AltTextTab.tsx) — one row per image asset; find → write → publish → verify; shows worker-drafted suggestions read-only.
- [ui/components/audit/LinksTab.tsx](../../src/modules/site-monitoring/ui/components/audit/LinksTab.tsx) — one row per dead URL; broken and "couldn't verify" kept apart.
- [ui/components/audit/PageFixes.tsx](../../src/modules/site-monitoring/ui/components/audit/PageFixes.tsx), [FindingPages.tsx](../../src/modules/site-monitoring/ui/components/audit/FindingPages.tsx), [relative-time.ts](../../src/modules/site-monitoring/ui/components/audit/relative-time.ts) — row sheet fixes, "On N pages" list, time helpers.
- [ui/components/ProjectTextCheckCard.tsx](../../src/modules/site-monitoring/ui/components/ProjectTextCheckCard.tsx) — "Search text across pages".
- Weight tab, WorkerPanel, alt suggestions, image index, image budget, webflow asset index: same folder, owned by the worker/alt-text doc.

### Components (`src/components`)
- [website-audit-dashboard.tsx](../../src/components/website-audit-dashboard.tsx), [page-details.tsx](../../src/components/page-details.tsx), [scan-sitemap-dialog.tsx](../../src/components/scan-sitemap-dialog.tsx), [projects/ProjectTextCheckCard.tsx](../../src/components/projects/ProjectTextCheckCard.tsx) — one-line re-export shims into the modules.
- [page-judgment.tsx](../../src/components/page-judgment.tsx) — `PageJudgmentContent`, `pageJudgmentHealth`.
- [projects/AuditDetailDialog.tsx](../../src/components/projects/AuditDetailDialog.tsx) — tabbed category modal for one link's `auditResult`.
- [projects/AuditDashboard.tsx](../../src/components/projects/AuditDashboard.tsx) — older summary dashboard; not imported anywhere.
- [qa/QAWidget.tsx](../../src/components/qa/QAWidget.tsx), [qa/QAChecklist.tsx](../../src/components/qa/QAChecklist.tsx) — designer-defaults checklist in the embed widget; one automated item hits `/api/qa/scan-fonts`.
- Diff/history viewers used by page details: [change-log-timeline.tsx](../../src/components/change-log-timeline.tsx), [change-diff-viewer.tsx](../../src/components/change-diff-viewer.tsx), [html-preview.tsx](../../src/components/html-preview.tsx), [screenshot-diff.tsx](../../src/components/screenshot-diff.tsx), [visual-diff-viewer.tsx](../../src/components/visual-diff-viewer.tsx), [social-card-preview.tsx](../../src/components/social-card-preview.tsx).
- [ScanSitemapDialog.tsx](../../src/modules/project-links/ui/components/ScanSitemapDialog.tsx) (project-links module) — sitemap dialog; `ProjectDetailScreen.handleManualSitemapSync` is the other `/api/scan-sitemap` caller.

### Services (`src/services`)
- [PageScanner.ts](../../src/services/PageScanner.ts) — `PageScanner` / `pageScanner`: `scan(url)` → `PageScanResult` (hashes, `ExtendedContentSnapshot` with blocks/textElements/images/links, categories: placeholders, spelling (always empty), readability (stub), completeness, seo, technical (stub), schema, links (counts only), openGraph, twitterCards, metaTags, headingStructure, accessibility); `scanImagesOnly(url)`; `scanFonts(url)`.
- [LinkCheckerService.ts](../../src/services/LinkCheckerService.ts) — `checkBrokenLinks(links, pageUrl, options)`, `classifyStatus`, `normalizeLinkUrl`, `runPool`, `clearLinkCheckCache`. HEAD then GET retry, dedupe, `liveOrigin` recheck for staging.
- [LinkCheckCache.ts](../../src/services/LinkCheckCache.ts) — `TtlCache` with in-flight dedupe (module-level, per lambda instance).
- [ScanJobService.ts](../../src/services/ScanJobService.ts) — `createScanJob`, `getScanJob`, `getActiveScanJobsForProject`, `getAllActiveScanJobs`, `getRunnableScanJobs`, `shouldKickScanJob`, `cancelScanJob`, `processScanJobBatch`, `calculateScanPercentage`, `loadProjectAdmin` (project + all `link_audits`), `loadAllProjectsAdmin`.
- [AuditService.ts](../../src/services/AuditService.ts) — `auditService` / `AuditService`: `saveAuditLog`, `getLatestAuditLog`, `getRecentAuditLogs`, `deleteAuditLogsForLink`, `cleanupOldAuditLogs` (called only by `/api/cron/cleanup`, which is not scheduled in vercel.json).
- [PageJudgmentService.ts](../../src/services/PageJudgmentService.ts) — `judgeScannedPage`: never throws; carries the previous judgment forward when unchanged.
- [ChangeLogService.ts](../../src/services/ChangeLogService.ts) — `content_changes` writes/reads (`saveEntry`, `getLatestEntry`, `getHistory`, `deleteEntriesForLink`).
- [ScanNotificationQueueService.ts](../../src/services/ScanNotificationQueueService.ts) — completion notification + anomaly detection queue (`scan_notifications`); documented in the site-monitoring doc.
- [ScreenshotService.ts](../../src/services/ScreenshotService.ts), [ScreenshotStorageService.ts](../../src/services/ScreenshotStorageService.ts) — puppeteer capture; upload to Storage `screenshots/{projectId}/{linkId}/{ts}.webp`.

### Lib (`src/lib`)
- [scan-utils.ts](../../src/lib/scan-utils.ts) — `computeChangeStatus`, `computeFieldChanges`, `generateDiffPatch`, `computeBodyTextDiff`, `compareBlocks`, `compareTextElements`, `compactAuditResult` + `AUDIT_COMPACT_LIMITS`.
- [audit-admin.ts](../../src/lib/audit-admin.ts) — `server-only` firebase-admin writes touching one audit doc: `loadLinkAuditAdmin`, `saveImageAltResultsAdmin`, `saveBrokenLinkResultsAdmin` (no caller found), `setImageScanJobAdmin`, `saveScannedLinkAdmin`, `AuditAdminUnavailableError`; re-exports loaders from [project-admin.ts](../../src/lib/project-admin.ts).
- [audit-previous.ts](../../src/lib/audit-previous.ts) — `previousSummaryOf` (stored on each audit as `previous`), `previousLinksFrom`, `linksScannedSince` (used by anomaly detection).
- [scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts) — `getRequestBaseUrl`, `triggerScanJobProcessing`.
- [scan-target-url.ts](../../src/lib/scan-target-url.ts) — `resolveScanTargetUrl`: if the project has a link titled like "staging"/"stage", scans hit that host (path kept); links titled "live" define the live host.
- [cron-auth.ts](../../src/lib/cron-auth.ts) — `isCronAuthorized`, `getCronSecretHeaders`.
- [jev.ts](../../src/lib/jev.ts) — `server-only` `askJev` (fetch to TypeSafe, 20 s timeout), `hasJevCredentials`, `noulOf`/`choiceOf`/`scoreOf`.
- [jev-qa.ts](../../src/lib/jev-qa.ts) — `judgePage` → `PageJudgment`; `JEV_THRESHOLDS` (pass 0.75 / fail 0.35), `SPELLING_DISMISS_AT`; caps: 2,500 chars copy, 12 images, 20 spelling flags, 15 broken links.
- [page-judgment.ts](../../src/lib/page-judgment.ts) — client-safe: `readJudgment`, `JUDGMENT_PASS_AT`/`FAIL_AT`, `JUDGMENT_MAX_AGE_MS` (30 days), `shouldJudgePage`, `buildPageJudgmentInput`.
- [jev-basics.ts](../../src/lib/jev-basics.ts) — `refineBasicsGap`, used by `/api/delivery/basics-gap` (delivery area, not scans).
- [spellChecker.ts](../../src/lib/spellChecker.ts) — `hybridSpellChecker` (LanguageTool via `/api/check-text`, nspell fallback, custom jargon list).
- [website-text-check.ts](../../src/lib/website-text-check.ts) — `normalizeSearchText`, `extractSearchableTextFromHtml`, `findTextMatchSummary`, `checkWebsiteTextTarget`.
- [html-diff.ts](../../src/lib/html-diff.ts) — `computeHtmlDiff`, `wrapDiffHtml`, `getDiffStyles` for `/api/visual-diff`.

### Workflows
- [workflows/image-scan.ts](../../src/workflows/image-scan.ts) — Vercel Workflow (`'use workflow'`, `'use step'`, enabled by `withWorkflow` in [next.config.ts](../../next.config.ts)). Blocks of 5 pages via `Promise.all`, heartbeat to `project.imageScanJob`, cleared at the end.

### Types
- [types/index.ts](../../src/types/index.ts) — `ProjectLink`, `FolderPageTypes`, `ChangeStatus`, `ContentSnapshot`, `ExtendedContentSnapshot`, `PreviousAuditSummary`, `AuditResult`, `FieldChange`, `ChangeLogEntry`, `ImageScanJob`, `WebsiteTextCheckTarget`, `WebsiteTextCheckResponse`, `PageJudgment`. `ScanJob`/`ScanJobSummary` are in `ScanJobService.ts`; `AuditLogEntry` in `AuditService.ts`; `AuditDecision`/findings types in `audit-findings.ts`. QA widget types in [types/qa.ts](../../src/types/qa.ts).

## Data model

| Path | One doc = | Key fields (type / file) | Written by | Read by | SDK |
| --- | --- | --- | --- | --- | --- |
| `projects/{id}` | project | `links: ProjectLink[]` (id, url, title, `source: 'auto'\|…`, `pageType`, `locale`, order — **no** `auditResult`), `sitemapUrl`, `folderPageTypes`, `detectedLocales`, `pathToLocaleMap`, `imageScanJob: ImageScanJob`, `enableSpellcheck`, `status` (`Project`, types/index.ts) | scan-sitemap, `saveScannedLinkAdmin`, `updateProjectLinksAdmin` (admin); dashboard folder editor, `updateLink` (client) | everything | both |
| `projects/{id}/link_audits/{linkId}` | the latest compacted audit of one page | `AuditResult`: score, canDeploy, fullHash, contentHash, changeStatus, lastRun, compact `contentSnapshot` (≤ 8 images, missing-alt first), `categories.*` incl. `links.brokenLinks`/`unverifiableLinks` (≤ 8 each), `seo.imagesWithoutAlt`, `seo.imageScanCheckedAt`, `judgment: PageJudgment`, screenshotUrl, previousScreenshotUrl, `previous: PreviousAuditSummary` | scan-pages, bulk worker, scan-images, image workflow (admin); link checks from the browser (`projectsService.saveBrokenLinkResults`, client) | `projectsService.subscribeToProject` merges into `project.links[].auditResult`; `loadProjectAdmin`; share page | both |
| `projects/{id}/audit_decisions/{decisionId}` | a team decision on a finding | `AuditDecision` (audit-findings.ts): kind `alt\|link\|weight`, fingerprint, decision `decorative\|ignored\|fixed_unverified\|verified`, reason, altText, by, at | dashboard (client) | dashboard (client); not the share view | client |
| `audit_logs/{autoId}` | one scan that was not `NO_CHANGE` | `AuditLogEntry` (AuditService.ts): projectId, linkId, url, timestamp, fullHash, contentHash, `htmlSource` (truncated at 900,000 chars), diffPatch, screenshotUrl; scan-pages also stores fieldChanges, blocks, textElements | `AuditService.saveAuditLog` (client SDK, from server) | diffs (`getLatestAuditLog`), `/api/audit-logs/previous` | client SDK |
| `content_changes/{autoId}` | one change-log entry | `ChangeLogEntry`: changeType `FIRST_SCAN\|CONTENT_CHANGED\|TECH_CHANGE_ONLY`, fieldChanges, summary, contentSnapshot, hashes, auditScore | `changeLogService.saveEntry` | `ChangeLogTimeline`, `getLatestEntry` | client SDK |
| `scan_jobs/{scanId}` (`scan_<ms>_<rand>`) | one bulk scan | `ScanJob` (ScanJobService.ts): status `queued\|running\|completed\|failed\|cancelled`, current/total, currentUrl, targetLinkIds, completedLinkIds, summary {noChange, techChange, contentChanged, failed}, processingStartedAt (lock/heartbeat), cancelRequested, scanCollections, captureScreenshots | ScanJobService (client SDK, transactions) | scan-bulk routes, crons, nav indicator | client SDK |
| `scan_notifications/{scanId}` | completion notification job | see ScanNotificationQueueService | ScanNotificationQueueService | same | client SDK |
| Storage `screenshots/{projectId}/{linkId}/{ts}.webp` | page screenshot | — | `uploadScreenshot` | page details | client Storage SDK |

**Rules** ([firestore.rules](../../firestore.rules)): `link_audits` and `audit_decisions` are `canAccessProjectById()` (admin, project owner, or `@activeset.co`) at lines 108–118. `scan_jobs`, `scan_notifications`, `audit_logs`, `content_changes` are `allow read, write: if true` (lines 196–201) — this is what lets the server write them with the unauthenticated browser SDK.

**Indexes** ([firestore.indexes.json](../../firestore.indexes.json)): `audit_logs` (projectId ASC, linkId ASC, timestamp DESC) backs `getLatestAuditLog`; `content_changes` (linkId ASC, timestamp DESC) backs `getLatestEntry`. `getAllActiveScanJobs` uses a single `status in [...]` and needs none.

## Background jobs

| What | Schedule (vercel.json) | Route | Auth | Does |
| --- | --- | --- | --- | --- |
| Daily scan trigger | `30 0 * * *` | `/api/cron/daily-scan` | `CRON_SECRET` | For each project with `status` `current` (or unset) and ≥ 1 `auto` link: resume a stalled active job, skip a healthy one, else `createScanJob` (`scanCollections: true`, `captureScreenshots: true`) and kick `/process`. Returns started/resumed/alreadyRunning/failed |
| Scan queue recovery | `*/5 * * * *` | `/api/cron/scan-jobs` | `CRON_SECRET` | `getRunnableScanJobs` (queued, or running with lock older than 8 min) → kick `/process`; then `processPendingScanNotifications` |
| Scan batch self-chain | on demand | `/api/scan-bulk/process` | `CRON_SECRET` headers from `getCronSecretHeaders` | Claim job (transaction), scan ≤ 10 pages in chunks of 5, persist per chunk, release, re-POST itself while `running` |
| Audit log cleanup | not scheduled | `/api/cron/cleanup` | `CRON_SECRET` | Deletes `audit_logs` older than `maxAgeDays`, keeping the newest `keepPerLink` per link; `audit_logs` otherwise grows unbounded |
| Durable image-ALT scan | on demand | `/api/image-scan/start` | none | Vercel Workflow `imageScanWorkflow` |

Health report (`0 4 * * *`) and anomaly alerts run off scan completion; see the site-monitoring doc.

## Configuration

| Env var | Required | Used in |
| --- | --- | --- |
| `CRON_SECRET` | Yes in production (fail-closed: unset rejects all cron/process calls) | [cron-auth.ts](../../src/lib/cron-auth.ts) |
| `NEXT_PUBLIC_BASE_URL` | Yes in production for self-calls | [scan-job-dispatch.ts](../../src/lib/scan-job-dispatch.ts) `getRequestBaseUrl`; notify route |
| `FIREBASE_SERVICE_ACCOUNT_JSON` (or the other admin credential vars read in [firebase-admin.ts](../../src/lib/firebase-admin.ts)) | Yes; without it scan-sitemap/scan-bulk/daily-scan return 503 and admin helpers throw `AuditAdminUnavailableError` | firebase-admin |
| `TYPESAFE_API_KEY` | Optional; unset = no judgments, scans unchanged | [jev.ts](../../src/lib/jev.ts) |
| `LANGUAGETOOL_URL` | Optional; else public LanguageTool | [check-text/route.ts](../../src/app/api/check-text/route.ts) |
| `GEMINI_API_KEY` | Only for `/api/audit` | [audit/route.ts](../../src/app/api/audit/route.ts) |
| `PUPPETEER_EXECUTABLE_PATH`, `VERCEL` | Screenshot runtime selection | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) |

Per-project config on the project doc: `sitemapUrl`, `folderPageTypes`, `enableSpellcheck`, `webflowConfig.siteId`/`customDomain` (Webflow token read server-side via `getWebflowToken` from `project_secrets`). Staging/live mapping is inferred from link titles containing "staging" / "live". No feature flags.

## External services

| Service | Called from | Auth |
| --- | --- | --- |
| Target websites (page HTML, link HEAD/GET, fonts CSS) | `PageScanner`, `LinkCheckerService`, `website-text-check.ts` | none; UA `ActiveSet-Audit-Bot/1.0` |
| Webflow Data API v2 (`/v2/sites/{id}`, `/v2/sites/{id}/pages`) | [scan-sitemap/route.ts](../../src/app/api/scan-sitemap/route.ts) `fetchWebflowSyncData` | Bearer project Webflow token |
| TypeSafe Jev (`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) | [jev.ts](../../src/lib/jev.ts) | Bearer `TYPESAFE_API_KEY` |
| LanguageTool | [check-text/route.ts](../../src/app/api/check-text/route.ts) | none |
| Google Gemini (`@google/genai`, `gemini-flash-latest`) | [audit/route.ts](../../src/app/api/audit/route.ts) | `GEMINI_API_KEY` |
| Headless Chromium (puppeteer-core + @sparticuz/chromium) | [ScreenshotService.ts](../../src/services/ScreenshotService.ts) | — |
| Vercel Workflow runtime (`workflow/api` `start`, `getRun`) | image-scan routes | platform |
| Firebase Firestore / Storage | throughout | admin credentials / client SDK |

## Key flows

1. **Discover pages (Sync sitemap).** Project detail "sync" or `ScanSitemapDialog` → `POST /api/scan-sitemap` → `loadProjectAdmin` → `fetchWebflowSyncData` (page-type maps, optional page list) → fetch + `parseSitemap` (hreflang locales) or Webflow fallback → `resolveDomainMapping`/`remapSitemapEntriesToStaging` → stale `auto` links dropped and their `audit_logs`/`content_changes` deleted → new links get `crypto.randomUUID()`, title from path (+`[LOCALE]`), `pageType` via `detectPageType` → one admin `update` of `links` (audits stripped) + sitemap/locale/folder fields.

2. **Single-page rescan.** Page details "Rescan" → `POST /api/scan-pages` → `loadProjectAdmin` → `resolveScanTargetUrl` → `pageScanner.scan` → `checkBrokenLinks(..., { liveOrigin: url })` → start `judgeScannedPage` (after links) → `computeChangeStatus` → on `CONTENT_CHANGED` read `AuditService.getLatestAuditLog` for `generateDiffPatch` / `computeBodyTextDiff` / `computeFieldChanges` → screenshot if first scan, no screenshot, or content changed → await judgment → `compactAuditResult` → `saveScannedLinkAdmin` (one `link_audits` doc + that link's row) → `saveAuditLog` unless `NO_CHANGE` → `changeLogService.saveEntry` on change or first history. The screen updates via its Firestore subscription.

3. **Bulk scan (button or nightly).** Dashboard "Scan" → `POST /api/scan-bulk` (or daily cron) → `createScanJob` → `triggerScanJobProcessing` → `/api/scan-bulk/process` → `processScanJobBatch`: `claimScanJob` transaction (lock = `processingStartedAt`, 8 min) → up to 10 remaining targets, 5 at a time, each `scanSinglePage` (same pipeline as flow 2, honouring `captureScreenshots`) with a per-page heartbeat → after each chunk `updateProjectLinksAdmin` (only changed audit docs + whole links array) and `recordCompletedLinks` → `releaseScanJobAfterBatch` → if still `running`, POST `/process` again; if `completed`, `ensureScanNotificationQueued` + `processQueuedScanNotification`. Browser polls `/api/scan-bulk/status` (which also kicks stalled jobs); `/api/cron/scan-jobs` every 5 min recovers anything dropped.

4. **Findings → decision → verify (alt text).** `collectFindings(links, decisions)` builds one `AltFinding` per image fingerprint across pages (skipping OG/Twitter/screenshot images) → `fixesRollup` feeds `AuditHeader`; `readinessOf` feeds Pages row status. Save in `AltTextTab` → `PATCH /api/webflow/assets/{assetId}` (asset id resolved via `useWebflowAssetIndex`) → record `fixed_unverified` → "Publish site" → Verify → `POST /api/scan-images` for the first page → image gone or alt present ⇒ record `verified`, else warn. A later scan (`imageScanCheckedAt`/`lastRun` newer than `decision.at`) still missing alt turns it `regressed` (`altStateFor`).

5. **Links triage.** `LinksTab` Recheck / "Check all pages" → `POST /api/check-links` per page (3 concurrent browser workers, stoppable) → browser `siteMonitoringRepository.saveBrokenLinkResults` → subscription → `collectFindings` groups by `linkFingerprint`; statuses 999/403/429/401 go to "couldn't verify", never broken. "Ignore" records `ignored` with a reason.

6. **Jev judgment.** `judgeScannedPage` → `shouldJudgePage` (skip and carry forward if `fullHash` unchanged and judgment < 30 days old) → `buildPageJudgmentInput` → `judgePage` → `askJev`. No key, a timeout, or an error returns the previous judgment only when content is unchanged, else `undefined`. Stored on `categories.judgment`; displayed by `PageJudgmentContent`; `decorative` and `matters` only order lists, never auto-dismiss.

## Gotchas and invariants

- **Self-calls must use `NEXT_PUBLIC_BASE_URL`.** `getRequestBaseUrl` prefers it ([scan-job-dispatch.ts:3-12](../../src/lib/scan-job-dispatch.ts)). Vercel crons arrive on the protected `*.vercel.app` host, which 302s to SSO; the daily scan silently failed for months until 2026-09-20 because it built URLs from the `host` header. Grep new cron code for `request.headers.get('host')` used as a base URL.
- **The daily scan is start-and-return.** It does not wait for scans. Anomaly detection runs at job completion against `auditResult.previous` ([audit-previous.ts](../../src/lib/audit-previous.ts)), so every scan path must write `previous: previousSummaryOf(prevResult)` (scan-pages and `scanSinglePage` both do).
- **`/process` is fail-closed without `CRON_SECRET` in production** ([cron-auth.ts:20-28](../../src/lib/cron-auth.ts)). A missing secret means bulk scans are created but never run.
- **Link check before Jev.** `judgeScannedPage` must start after `checkBrokenLinks` resolves ([scan-pages/route.ts:120](../../src/app/api/scan-pages/route.ts), [ScanJobService.ts:857](../../src/services/ScanJobService.ts)); started earlier it judged the scanner's hardcoded empty `brokenLinks` list. It overlaps the screenshot instead.
- **Bot blocks are not broken links.** 999/403 → `bot-blocked`, 429 → `rate-limited`, 401 → `auth-required` are `unverifiableLinks` and do not fail the page ([LinkCheckerService.ts:184](../../src/services/LinkCheckerService.ts)); older audits that stored them in `brokenLinks` are reclassified by `UNVERIFIABLE_STATUSES` ([audit-findings.ts:67](../../src/modules/site-monitoring/domain/audit-findings.ts)).
- **Only 50 distinct URLs per page are link-checked** (`maxLinksToCheck`, [LinkCheckerService.ts:92](../../src/services/LinkCheckerService.ts)); links beyond are neither checked nor counted. The verdict cache is per lambda instance and lives 5 min (60 s for transient failures).
- **Stored audits are truncated.** `compactAuditResult('standard')` keeps 8 snapshot images (missing-alt first) and 8 broken / 8 unverifiable links per page ([scan-utils.ts:32](../../src/lib/scan-utils.ts), [:44](../../src/lib/scan-utils.ts)), and drops `bodyText`, `links`, `sections`. Findings and counts in the dashboard can undercount on image- or link-heavy pages.
- **`project.links` is rewritten whole** on every persist (`updateProjectLinksAdmin`, [ScanJobService.ts:186](../../src/services/ScanJobService.ts); `saveScannedLinkAdmin`), so a concurrent edit to link metadata can be lost. Audits themselves are safe in `link_audits`. Fix is per-link docs; not done.
- **History reads.** `getLatestAuditLog` is `limit(1)` + composite index, with an unbounded fallback if the index is missing ([AuditService.ts:96](../../src/services/AuditService.ts)). `getRecentAuditLogs` (used by `/api/audit-logs/previous`) is still unbounded and sorts in memory ([AuditService.ts:121](../../src/services/AuditService.ts)): it downloads every full-HTML log for the page.
- **Deploying indexes:** put every index the live project has into `firestore.indexes.json` first (`npx firebase firestore:indexes`); on 2026-09-20 a deploy prompted to delete 4 live indexes and they were deleted. If the delete prompt appears, answer N.
- **`audit_logs` only on change.** `NO_CHANGE` scans write no log ([scan-pages/route.ts:278](../../src/app/api/scan-pages/route.ts)). The bulk path's log omits `fieldChanges`, `blocks`, `textElements` that the single-page path stores, so page-details block/text diffs are richer after a manual rescan.
- **Screenshots:** captured only on first scan, missing screenshot, or `CONTENT_CHANGED` ([scan-pages/route.ts:200](../../src/app/api/scan-pages/route.ts)). `/api/scan-pages` ignores any `captureScreenshots` preference; the bulk path honours it. Very tall pages were uploading 0-byte WebP (Chrome caps a side at 16,383 px); older audits for such pages may point at empty files.
- **Staging remap is title-driven.** A project link titled with "staging"/"stage" makes every scan hit the staging host ([scan-target-url.ts](../../src/lib/scan-target-url.ts)); the link checker re-checks same-site 404s on the live origin. `/api/check-links` does not remap or pass `liveOrigin` ([check-links/route.ts:35](../../src/app/api/check-links/route.ts)), so "Check all pages" checks exactly `link.url`.
- **Webflow alt Save is not live until the site is published.** Save records `fixed_unverified`; do not auto-verify right after save.
- **Decisions are keyed by fingerprint hash**, so a rescan cannot resurrect a decorative/ignored call. `decorative` holds forever; `verified`/`fixed_unverified` hold only until a newer scan still shows no alt ([audit-findings.ts:278](../../src/modules/site-monitoring/domain/audit-findings.ts)). The share view cannot read decisions (rules are team-only).
- **Stale page removal leaves `link_audits` docs behind.** scan-sitemap deletes `audit_logs` and `content_changes` for removed links ([scan-sitemap/route.ts:638](../../src/app/api/scan-sitemap/route.ts)) but not `projects/{id}/link_audits/{linkId}`; `loadProjectAdmin` ignores orphans because it maps by link id.
- **Browser SDK on the server.** `scan_jobs`, `audit_logs`, `content_changes`, `scan_notifications` are written server-side with the client SDK and rely on world-open rules (firestore.rules:196-201). `save-audit`, `audit-config`, `scan-bulk/notify` and `/api/audit` call `projectsService` (client SDK) server-side against `projects`, whose rules require auth ([save-audit/route.ts:282](../../src/app/api/save-audit/route.ts), [audit-config/route.ts:19](../../src/app/api/audit-config/route.ts)); this is the failure mode that broke Scan Images before its admin rewrite.
- **Bulk scans cover `source: 'auto'` links only** ([scan-bulk/route.ts:86](../../src/app/api/scan-bulk/route.ts)); manual links are never bulk-scanned. Manual bulk scans skip `pageType: 'collection'` unless "include collections"; the daily scan always includes them ([daily-scan/route.ts:79](../../src/app/api/cron/daily-scan/route.ts)).
- **Jev thresholds are uncalibrated** (0.75 / 0.35, [jev-qa.ts:53](../../src/lib/jev-qa.ts)) and duplicated in [page-judgment.ts:22](../../src/lib/page-judgment.ts); change both. Page copy goes in `state`, never `instructions`.
- **Scanner spelling is always empty** (`categories.spelling.issues: []` in `PageScanner.scan`), so Jev's spelling filter never runs on scans; real spelling only comes from the embed widget via `/api/check-text`.
- **Image scans do not bump `lastRun`**; they write `seo.imageScanCheckedAt`. `setImageScanJobAdmin` must not bump `updatedAt` (the project list sorts by it).

## Tests

| File | Run with |
| --- | --- |
| [scan-utils.test.ts](../../src/lib/scan-utils.test.ts), [page-judgment.test.ts](../../src/lib/page-judgment.test.ts), [website-text-check.test.ts](../../src/lib/website-text-check.test.ts) | `npm run test:lib` (part of `npm test`) |
| [audit-findings.test.ts](../../src/modules/site-monitoring/domain/audit-findings.test.ts) | `npm run test:site-monitoring` (also in `test:domain`, `npm test`) |
| [LinkCheckerService.test.ts](../../src/services/LinkCheckerService.test.ts) | Not in any npm script; `npx tsx --test src/services/LinkCheckerService.test.ts` |
| [tests/firestore.rules.test.ts](../../tests/firestore.rules.test.ts) | `npm run test:rules` (emulator) |

No tests for the API routes, `ScanJobService`, or `PageScanner`.

## Related docs

- [docs/features/audit-dashboard.md](../features/audit-dashboard.md) — partially stale. The "fix loop (2026-09-20 redesign)" section and page-details/visual QA sections are broadly right. Stale: presents `/api/save-audit` (widget) as the main sync path; shows `auditResult` inside `projects.links[]` (audits now live in `link_audits`); "No scheduled scans" under Known Limitations (daily cron + scan queue exist); UI paths point at the re-export shims rather than `src/modules/site-monitoring`.
- [docs/features/jev-judgments.md](../features/jev-judgments.md) — mostly accurate on thresholds, questions and measurements. Stale: says `npm run test:delivery` covers the threshold bands (the scan-side tests are `src/lib/page-judgment.test.ts` under `test:lib`); implies the spell-checker filter applies to scans, but scanner spelling is always empty.
- [docs/plans/audit-redesign.md](../plans/audit-redesign.md) — accurate as a design record; "What shipped" says no alt suggestions, but the Alt text tab now shows worker-drafted suggestions from `alt_suggestions` (read-only).
- [docs/plans/scan-performance.md](../plans/scan-performance.md) — accurate for the changes it describes (link checker pool/cache, bounded history reads, 5-minute recovery cron). It still tells you indexes need deploying; they were deployed 2026-09-20.
- [docs/features/site-monitoring.md](../features/site-monitoring.md) — alerts, anomaly detection, health report (not verified here).
- [docs/features/alt-text.md](../features/alt-text.md), [docs/features/worker.md](../features/worker.md) — alt drafting and image weight (worker side).
