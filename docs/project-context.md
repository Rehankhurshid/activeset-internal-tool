# Project Context: Project Links Widget

## Overview

This project is a **Next.js internal dashboard + embeddable widget tooling** for managing project links, audits, proposals/checklists, and Webflow page SEO.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: Shadcn UI + Tailwind CSS 4
- **Database**: Firebase Firestore (Real-time)
- **Auth**: Firebase Auth
- **AI**: Google Gemini (via `@google/genai`)
- **Hosting**: Vercel (serverless)
- **Notifications**: Gmail SMTP (nodemailer) + Slack Webhooks

## Core Modules

### 1. Project Links

- CRUD for text/image links.
- Drag-and-drop reordering.
- Real-time updates via Firestore listeners.
- Project cards show status (Current/Past), tags, Webflow badge, and scan progress badge.

### 2. Proposal Generator

A comprehensive system for managing the full lifecycle of client proposals.

- **AI Engine**: Full proposal generation from meeting notes and block-level editing.
- **Collaboration**: Real-time commenting system and version history tracking.
- **Client Flow**: Public sharing URLs with electronic signature capture.
- **Output**: High-fidelity, print-optimized PDF generation matching the browser view.
- **Dashboard**: Sorting, grouping, and template library for team efficiency.

### 3. Webflow Pages Manager

A comprehensive tool for managing Webflow site SEO.

#### Architecture

- **API**: Uses Webflow Data API v2 (`/pages/{id}`, `/sites/{id}`).
- **State**: Custom `useWebflowPages` hook manages fetching, caching, and optimistic updates.
- **AI Integration**:
  - **Endpoint**: `/api/ai-seo-gen`
  - **Logic**: Fetches page DOM -> Extracts text -> Gemini generates JSON (Title, Desc, OG).
  - **Bulk Gen**: Client-side queue processes pages sequentially to avoid timeouts.

#### Key Components

- **`WebflowPagesDashboard.tsx`**: Main table view.
  - **Features**: Compact layout, HoverCard Quick View, Nested folder badges, Status badges.
- **`WebflowBulkSEOEditor.tsx`**: Spreadsheet-style editor.
  - **Features**: Locking mechanism, Bulk AI Generation, progress tracking.
  - **Safety**: Prevents saving slug updates for utility pages (404/Password).
- **`WebflowSEOEditor.tsx`**: Single page slide-over editor.

### 4. Site Monitoring & Alerts

Automated daily scanning with anomaly detection and multi-channel alerting.

#### Scanning Architecture

- **Scan Jobs**: Firestore-persisted (`scan_jobs` collection) — survives serverless restarts.
- **Batched Processing**: Scans run in small server-side batches via `/api/scan-bulk/process`.
- **Progress Tracking**: Real-time via `ScanJobService` with Firestore persistence.
- **Notification Queue**: `scan_notifications` collection ensures notifications are sent even if the scan function terminates.
- **Cron Jobs**:
  - `/api/cron/daily-scan` — Scans all current projects with sitemaps, runs anomaly detection, generates health report.
  - `/api/cron/scan-jobs` — Processes queued scan jobs and pending notifications.
  - `/api/cron/scan-notifications` — Fallback cron to drain queued notifications.
  - `/api/cron/cleanup` — Removes old audit logs and change history.

#### Anomaly Detection

Detects issues by comparing current vs previous scan results:
- **Gibberish Content** (critical): >60% word count drop
- **Content Degradation** (warning): >20 point score drop
- **Mass Changes** (warning): >50% pages changed at once
- **Scan Failures** (critical/warning): Pages returning errors
- **SEO Regression** (warning): Missing titles/descriptions/H1s that previously existed
- **Word Count Drop** (warning): 40-60% content reduction

#### Multi-Channel Notifications

- **Email**: HTML digest via Gmail SMTP (nodemailer)
- **Slack**: Block Kit messages via incoming webhook
- **Dashboard**: Real-time alert bell in nav + alert panel on home page

#### Health Reports

Daily aggregated issue tracking across all projects:
- Missing ALT text, meta descriptions, titles, H1s
- Broken links, spelling errors
- Missing Open Graph, schema/structured data
- Accessibility errors, low score pages (<60)
- Per-project breakdown with worst pages

### 5. SEO Engine

AI-powered blog generation with Claude API and Webflow CMS publishing.

## Conventions

- **SEO Data**: Stored in `seo` (WebflowSEO) and `openGraph` (WebflowOpenGraph) objects.
- **Validation**: Zod schemas used for form validation.
- **Environment**: API keys must be secure (server-side only for Webflow/Gemini).
- **Scan Progress**: Persisted to Firestore (`scan_jobs` collection) — not in-memory.
- **Notifications**: Queued to Firestore (`scan_notifications` collection) and processed via cron fallback.

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `projects` | User projects with links, webflowConfig, sitemapUrl |
| `audit_logs` | Full HTML source, hashes, diffs per scan |
| `content_changes` | Field-level change tracking over time |
| `project_checklists` | SOP checklist templates |
| `sop_templates` | Checklist template library |
| `scan_jobs` | Persistent scan job state (replaces in-memory store) |
| `scan_notifications` | Queued scan completion notifications |
| `site_alerts` | Anomaly alerts with read/dismissed state |
| `health_reports` | Daily aggregated health reports |
| `configurations` | Settings (agencies, services, terms) |
| `access_control` | Module access permissions |
