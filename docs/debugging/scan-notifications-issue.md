# Scan Completion Notifications — Debugging Log

## Goal

Send a **Slack notification** every time a project website scan completes. The notification should include project name, pages scanned, change summary, and health score.

## Current State (2026-04-05)

**Notifications do not fire.** Email was silently succeeding for old scans (April 3-4), but Slack never worked. New scans (April 5) don't even create notification documents.

---

## Architecture

### How Scanning Works

Scans run as **chained serverless batches** on Vercel:

1. **`POST /api/scan-bulk`** — User triggers scan. Creates a `scan_jobs` doc in Firestore with status `queued`. Triggers first batch.
2. **`POST /api/scan-bulk/process`** — Processes 10 pages per batch (5 concurrently). Uses `waitUntil()`. When done, triggers itself again for the next batch via HTTP fetch. Repeats until all pages are scanned.
3. **`GET /api/scan-bulk/status`** — Frontend polls every ~3s. When it sees `completed`, the frontend calls `window.location.reload()`.

A scan with 100 pages = ~10 batch invocations, each a separate serverless function call. The whole scan can take minutes to hours.

### How Notifications Should Work

When the final batch completes, there are **3 paths** to send a notification:

| Path | How it works | Status |
|------|-------------|--------|
| **Process route** | Final batch sees `status: 'completed'`, calls `ensureScanNotificationQueued()` then `processQueuedScanNotification()` inside `waitUntil()` | Not creating notification docs (April 5 scans) |
| **Status endpoint** | Frontend polls status, sees completed, queues and processes notification inside `waitUntil()` | Was running inline (killed by page reload), now fixed to use `waitUntil()` |
| **Cron** | `/api/cron/scan-notifications` runs every minute, drains pending notifications from Firestore | Running correctly, but finds 0 pending notifications |

### Notification Sending (`NotificationService.ts`)

```
sendScanCompletionNotification()
  ├── sendScanCompletionSlack()  →  uses SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN + SLACK_CHANNEL_ID
  └── sendScanCompletionEmail()  →  uses GMAIL_USER + GMAIL_APP_PASSWORD
```

If both fail, throws. If either succeeds (including `'skipped'`), returns success.

---

## Problems Found (3 total)

### Problem 1: `SLACK_WEBHOOK_URL` is not available at runtime (CURRENT BLOCKER)

**Evidence:**
- Debug endpoint (`/api/scan-bulk/debug-notifications`) shows:
  ```json
  {
    "hasSlackWebhook": false,
    "slackWebhookPreview": "NOT SET",
    "allSlackEnvKeys": [],
    "hasGmail": true
  }
  ```
- `process.env.SLACK_WEBHOOK_URL` is `undefined` in every serverless function
- Zero env vars containing "slack" exist at runtime

**What we tried:**
1. `vercel env add SLACK_WEBHOOK_URL production` via CLI — value confirmed with `vercel env pull` but NOT injected at runtime
2. Added for both `production` and `preview` environments — still not injected
3. Multiple redeploys (both `vercel --prod` and git push) — still not injected
4. Verified the value is correct: `https://hooks.slack.com/services/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`

**Why other env vars work:**
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`, Firebase vars all work at runtime
- These were likely set through the **Vercel Dashboard UI**, not the CLI
- The CLI-set vars appear in `vercel env ls` and `vercel env pull` but don't get injected into the runtime

**Fix needed:**
- Set `SLACK_WEBHOOK_URL` through the **Vercel Dashboard UI**: Settings > Environment Variables
- Also add `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` if you want the bot API fallback
- Then redeploy

### Problem 2: Today's scans don't create notification documents

**Evidence:**
- `scan_notifications` Firestore collection has 20 documents, all from April 3-4
- All have `status: "sent"` — but they only sent **email** (Slack was `'skipped'` since webhook URL was empty)
- Zero notification documents from April 5, despite multiple scans completing

**Suspected cause:**
- The `ensureScanNotificationQueued()` call in `processScanJobBatch()` is not being reached
- Either `releaseScanJobAfterBatch()` doesn't return `status: 'completed'`, or the function errors before reaching that point
- Logging was added (`[scan-jobs] Batch done for ... finalJob status: ...`) but no logs appear — the batch processing may be running on older deployments that don't have the logging code

**Why old scans (April 3-4) worked:**
- Those scans ran on the deployment that was active at that time
- The notification pipeline created docs and processed them
- Email sent successfully, Slack was skipped (empty webhook URL)

### Problem 3: Status endpoint notification was killed by page reload (FIXED)

**What happened:**
- Frontend polls `/api/scan-bulk/status`, gets `completed` response
- Status endpoint was processing notification **inline** (blocking the response)
- Frontend immediately called `window.location.reload()` on seeing completed
- This could abort the connection and kill the function before Slack send finished

**Fix applied (commit `f2b60a2`):**
- Moved notification processing to `waitUntil()` in the status endpoint
- Response now returns immediately, notification sends in background
- Vercel keeps function alive regardless of client disconnect

---

## What Was Changed (commits)

| Commit | Change |
|--------|--------|
| `bc143a9` | Added `scan-notifications` cron to `vercel.json` (was missing entirely) |
| `bc143a9` | Added `processQueuedScanNotification()` call in process route on completion |
| `f2b60a2` | Moved status endpoint notification to `waitUntil()` |
| `787d5d5` | Added `[scan-notify]` logging throughout notification pipeline |
| `49d15bd` | Added `[scan-jobs] Batch done` and `[scan-bulk/process]` completion logging |
| `d9df742` | Created debug endpoint at `/api/scan-bulk/debug-notifications` |

---

## Remaining Action Items

### Immediate (do these now)

1. **Set `SLACK_WEBHOOK_URL` via Vercel Dashboard UI** (not CLI)
   - Go to: Vercel > project-links-widget > Settings > Environment Variables
   - Add `SLACK_WEBHOOK_URL` = `https://hooks.slack.com/services/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`
   - Select: Production environment
   - Redeploy from Deployments tab

2. **Verify with debug endpoint** — `hasSlackWebhook` should be `true`

3. **Run a scan and check Vercel Logs** — filter for `[scan-notify]` to see:
   - `Queueing notification` → doc created
   - `Processing notification` → claimed for sending
   - `Sending Slack/Email` → reaching notification service
   - `Successfully sent` → done

### If notifications still don't fire after Slack env is set

4. **Investigate why April 5 scans don't create notification docs**
   - Check Firestore `scan_jobs` collection for today's completed scans
   - Verify `releaseScanJobAfterBatch()` returns `status: 'completed'`
   - May need to add logging before the `if (finalJob?.status === 'completed')` check to log ALL statuses

5. **Clean up debug endpoint** — remove `/api/scan-bulk/debug-notifications` after debugging is done

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/scan-bulk/process/route.ts` | Batch processor, triggers notification on completion |
| `src/app/api/scan-bulk/status/route.ts` | Status polling, also triggers notification |
| `src/app/api/cron/scan-notifications/route.ts` | Cron fallback to drain notification queue |
| `src/services/ScanJobService.ts` | Core scan logic, calls `ensureScanNotificationQueued` |
| `src/services/ScanNotificationQueueService.ts` | Queue management (Firestore `scan_notifications`) |
| `src/services/NotificationService.ts` | Slack webhook + Email sending |
| `src/app/api/scan-bulk/debug-notifications/route.ts` | Temporary debug endpoint |
| `vercel.json` | Cron schedule (scan-jobs, scan-notifications) |
| `.env.local` | Local env vars (has SLACK_BOT_TOKEN, SLACK_CHANNEL_ID) |
