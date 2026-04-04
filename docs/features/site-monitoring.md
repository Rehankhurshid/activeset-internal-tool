# Site Monitoring, Alerts & Health Reports

Automated daily scanning with anomaly detection, multi-channel alerting, and health reporting across all client websites.

## Core Architecture

### Scan Job System

Scans are persisted to Firestore (`scan_jobs` collection) instead of in-memory storage, making them resilient to serverless function restarts.

- **`ScanJobService.ts`**: Creates, updates, and queries scan jobs in Firestore.
- **`scan-job-dispatch.ts`**: Triggers scan processing via internal API calls with cron auth.
- **Batched Processing**: `/api/scan-bulk/process` handles scanning in small batches that fit within serverless execution limits.
- **Resumability**: If a function terminates mid-scan, the cron (`/api/cron/scan-jobs`) detects stalled jobs and resumes them.

### Notification Queue

Scan completion notifications use a Firestore-backed queue (`scan_notifications` collection) to guarantee delivery:

1. When a scan completes, a notification job is queued via `ensureScanNotificationQueued()`.
2. The status polling endpoint (`/api/scan-bulk/status`) attempts to process the notification immediately.
3. If that fails, the cron endpoints (`/api/cron/scan-jobs`, `/api/cron/scan-notifications`) process pending notifications as a fallback.
4. Notifications have retry logic with processing locks to prevent duplicate sends.

**Key Service**: `ScanNotificationQueueService.ts`

---

## Anomaly Detection

**Service**: `src/services/AnomalyDetector.ts`

Runs after each project scan in the daily cron. Compares current audit results against previous scan data.

### Detection Rules

| Type | Severity | Trigger |
|------|----------|---------|
| Gibberish Content | Critical | Word count dropped >60% from previous scan |
| Content Degradation | Warning | Audit score dropped >20 points |
| Mass Changes | Warning | >50% of pages changed in a single scan (min 5 pages, min 10 total) |
| Scan Failures | Critical/Warning | Pages returning errors (critical if >3) |
| SEO Regression | Warning | Title, meta description, or H1 that previously existed is now missing |
| Word Count Drop | Warning | 40-60% word count reduction on individual pages |

### Data Flow

```
Daily Cron → Scan Project → Compare current vs previous links
  → detectAnomalies() returns CreateSiteAlertInput[]
  → alertService.createAlerts() saves to Firestore
  → sendAlertNotifications() sends Email + Slack
```

---

## Multi-Channel Notifications

**Service**: `src/services/NotificationService.ts`

### Channels

| Channel | Implementation | Config |
|---------|---------------|--------|
| Email | Gmail SMTP via nodemailer | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` |
| Slack | Incoming Webhook (Block Kit) | `SLACK_WEBHOOK_URL` |
| Dashboard | Firestore real-time subscription | Automatic |

### Notification Types

1. **Anomaly Alerts** (`sendAlertNotifications`): Per-project alerts when anomalies detected.
2. **Scan Completion** (`sendScanCompletionNotification`): Per-project health summary after every scan.
3. **Daily Health Report** (`sendHealthReportNotifications`): Aggregated report across all projects.

All channels degrade gracefully — if env vars aren't set, that channel is silently skipped.

---

## Daily Health Reports

**Services**: `HealthReportGenerator.ts`, `HealthReportService.ts`

Aggregates issues from audit data across all current projects.

### Tracked Issues

| Issue | Source Field |
|-------|------------|
| Missing ALT Text | `seo.imagesWithoutAlt` + `accessibility.issues[type=alt-text]` |
| Missing Meta Description | `contentSnapshot.metaDescription` |
| Missing Title | `contentSnapshot.title` |
| Missing H1 | `contentSnapshot.h1` |
| Broken Links | `links.brokenLinks` |
| Spelling Errors | `spelling.issues` |
| Missing Open Graph | `openGraph.hasOpenGraph` |
| Missing Schema | `schema.hasSchema` |
| Accessibility Errors | `accessibility.issues` |
| Low Score Pages | `auditResult.score < 60` |

### Storage

Reports are stored in Firestore `health_reports` collection with per-project breakdowns and top issue pages.

---

## Dashboard UI Components

### Alert Bell (`AlertIndicator.tsx`)
- Located in `AppNavigation` next to scan activity indicator.
- Red badge with unread count.
- Dropdown listing recent alerts by severity.
- Real-time updates via Firestore subscription (`useAlerts` hook).
- Click marks as read + navigates to project.

### Alert Panel (`DashboardAlertPanel.tsx`)
- Shows on home page when there are active alerts.
- Color-coded border (red for critical, amber for warning).
- Dismissable alerts with severity icons.
- Links to affected projects.

### Health Panel (`DailyHealthPanel.tsx`)
- Shows on home page below alert panel.
- Average score ring, issue breakdown grid, per-project list.
- Sorted by worst score first.
- Links to project detail pages.

### Scan Badge (`ProjectScanBadge.tsx`)
- Shows on project cards for projects with scan data.
- Displays: scanned/total pages + relative time since last scan.
- Green when all pages scanned, amber when partial.
- Animates with spinner during active scans.
- Polls `/api/scan-bulk/running-all` for live progress.

### Webflow Badge
- Shows "WF" badge with globe icon on cards when `project.webflowConfig` exists.

---

## Cron Endpoints

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/daily-scan` | Daily | Scans all current projects, anomaly detection, health report |
| `/api/cron/scan-jobs` | Every few minutes | Resumes stalled scans, processes notification queue |
| `/api/cron/scan-notifications` | Every few minutes | Fallback: drains pending notifications |
| `/api/cron/cleanup` | Daily/Weekly | Removes old audit logs and change history |

All cron endpoints support `CRON_SECRET` for authentication via `x-cron-secret` header or `Authorization: Bearer` header.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/ScanJobService.ts` | Firestore-backed scan job management |
| `src/services/ScanNotificationQueueService.ts` | Notification queue with retry logic |
| `src/services/AnomalyDetector.ts` | Anomaly detection engine |
| `src/services/NotificationService.ts` | Email + Slack dispatch |
| `src/services/AlertService.ts` | Firestore CRUD for `site_alerts` |
| `src/services/HealthReportGenerator.ts` | Issue aggregation from audit data |
| `src/services/HealthReportService.ts` | Firestore CRUD for `health_reports` |
| `src/lib/scan-job-dispatch.ts` | Trigger scan processing via API |
| `src/lib/cron-auth.ts` | Cron secret validation |
| `src/types/alerts.ts` | Alert type definitions |
| `src/types/health-report.ts` | Health report type definitions |
| `src/hooks/useAlerts.ts` | Real-time alert subscription hook |
| `src/components/navigation/AlertIndicator.tsx` | Nav bar alert bell |
| `src/components/alerts/DashboardAlertPanel.tsx` | Home page alert panel |
| `src/components/alerts/DailyHealthPanel.tsx` | Home page health report |
| `src/components/projects/ProjectScanBadge.tsx` | Card scan progress badge |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SLACK_WEBHOOK_URL` | Optional | Slack incoming webhook for notifications |
| `GMAIL_USER` | Optional | Gmail sender for email notifications |
| `GMAIL_APP_PASSWORD` | Optional | Gmail app password |
| `NOTIFY_EMAIL` | Optional | Email recipient for alerts/reports |
| `CRON_SECRET` | Optional | Auth secret for cron endpoints |
| `NEXT_PUBLIC_BASE_URL` | Optional | Base URL for links in notifications (defaults to `https://app.activeset.co`) |
