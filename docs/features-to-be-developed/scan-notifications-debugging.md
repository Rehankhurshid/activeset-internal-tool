# Scan Completion Notifications — Debugging Context

## Problem
Scan completion notifications (Slack + Email) are not being sent after a project scan completes on Vercel.

## What we built (2026-04-03)
1. **Alert system** — anomaly detection, Firestore `site_alerts` collection, alert bell in nav, dashboard panel
2. **Health report** — daily aggregated issue tracking across projects (ALT text, meta desc, broken links, etc.)
3. **Per-project scan notification** — should send Slack + Email after every scan with health summary
4. **Scan badge on cards** — shows scanned/total pages + last scan time, animates during active scan
5. **Default filter** — dashboard defaults to "Current" projects

## Root cause (not yet resolved)
The scan runs via fire-and-forget in `runBulkScan()` inside `/api/scan-bulk/route.ts`. The POST handler returns immediately with a `scanId`, and the scan runs in the background. On Vercel serverless, background work after the response is sent has unreliable execution — the function can be killed before the notification code at the end of `runBulkScan()` executes.

**What was tried:**
1. Inline `await sendScanCompletionNotification()` at end of `runBulkScan()` — function gets killed
2. Fire-and-forget `fetch()` to `/api/scan-bulk/notify` endpoint — fetch dropped before completing
3. `await fetch()` to notify endpoint — still dropped
4. Next.js `after()` API — won't work for long scans (Vercel maxDuration limits)
5. Frontend-triggered notification — works but user wants server-side
6. **`waitUntil()` from `@vercel/functions`** — installed package, wrapped `runBulkScan()` promise with `waitUntil()` in the POST handler. This is Vercel's official API for keeping functions alive. Added verbose console.log at every step of notification flow. **NOT YET VERIFIED** — pushed as commit `6031a8b`, needs testing.

**Why scans themselves work but notifications don't:**
The scan makes many sequential Firestore writes during execution which keep the function alive. But the notification at the very end (after all writes are done) is the last thing to execute, and Vercel may terminate the function right after the last Firestore write since there are no more pending I/O operations keeping it alive.

## Current state of code
- `src/app/api/scan-bulk/route.ts` — has `waitUntil()` wrapping the scan promise + inline notification with verbose logging at end of `runBulkScan()`
- `src/services/NotificationService.ts` — has `sendScanCompletionNotification()` for Slack + Email
- `src/app/api/scan-bulk/notify/route.ts` — separate endpoint that works when called directly
- `maxDuration = 300` set on scan-bulk route
- `@vercel/functions` installed for `waitUntil()`

## Remaining solution if waitUntil doesn't work
- **Write a "pending notification" flag to Firestore** at scan completion (before the final Firestore write that saves scan results, add a `pending_notifications` doc), then have a separate lightweight cron/endpoint that checks for pending notifications and sends them. This decouples notification from the scan function entirely.

## Key files
| File | Purpose |
|------|---------|
| `src/app/api/scan-bulk/route.ts` | Main scan endpoint — fire-and-forget `runBulkScan()` with `waitUntil()` |
| `src/app/api/scan-bulk/notify/route.ts` | Separate notification endpoint (works when called directly) |
| `src/app/api/cron/daily-scan/route.ts` | Daily cron — notifications work here because it awaits scan completion |
| `src/services/NotificationService.ts` | Slack + Email sending (`sendScanCompletionNotification`, `sendAlertNotifications`, `sendHealthReportNotifications`) |
| `src/services/HealthReportGenerator.ts` | Aggregates issues from audit data into `ProjectHealthSummary` |
| `src/services/HealthReportService.ts` | Firestore CRUD for `health_reports` collection |
| `src/services/AnomalyDetector.ts` | Detects anomalies between scans (gibberish, score drops, SEO regression, etc.) |
| `src/services/AlertService.ts` | Firestore CRUD for `site_alerts` collection |
| `src/components/website-audit-dashboard.tsx` | Frontend scan UI with polling |
| `src/components/navigation/AlertIndicator.tsx` | Alert bell in nav bar |
| `src/components/alerts/DashboardAlertPanel.tsx` | Alert panel on dashboard home |
| `src/components/alerts/DailyHealthPanel.tsx` | Health report panel on dashboard home |
| `src/components/projects/ProjectScanBadge.tsx` | Scan badge on project cards (animated during scan) |
| `src/types/alerts.ts` | SiteAlert, AlertType, AlertSeverity types |
| `src/types/health-report.ts` | DailyHealthReport, ProjectHealthSummary types |
| `src/hooks/useAlerts.ts` | Real-time Firestore subscription for alerts |

## Environment
- **Hosting:** Vercel (production at app.activeset.co)
- **Slack:** `SLACK_WEBHOOK_URL` set in Vercel production env — webhook works when called directly (tested with curl, returns 200)
- **Email:** `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` all set — email works for proposal notifications
- **Firebase:** project-list-5aead — Firestore composite indexes created for `site_alerts`
- **Firestore collections:** `site_alerts`, `health_reports` (new)

## What works
- Daily cron notifications (anomaly alerts + health report) — works because cron awaits scan completion
- Alert bell in nav — real-time Firestore subscription
- Dashboard alert panel — shows unread alerts
- Scan badge on cards — shows progress + last scan time
- Slack webhook — confirmed working via direct curl test
- `/api/scan-bulk/notify` endpoint — works when called directly

## What doesn't work
- Per-project Slack/Email notification after manual scan completion — the notification code at the end of `runBulkScan()` doesn't execute reliably on Vercel serverless
