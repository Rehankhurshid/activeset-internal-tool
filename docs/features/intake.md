# Client Intake

A token-gated public form per project that replaces the "client as paid guest seat" workflow. Clients submit change requests at `/intake/<token>`; submissions land as `requests` blobs and (optionally) auto-create ClickUp tasks via AI parsing of bundled lists.

## Why this exists

Before:
- Clients were added as paid guests in ClickUp, dropped tasks directly, and wrote briefs as `.docx` attachments. Briefs were buried; tasks landed without owners or due dates; no audit trail.
- One-time, maintenance, and subscription clients all used the same shape — no way to distinguish or route differently.

After:
- One public URL per project. Client never needs a workspace seat.
- Submission is structured (name, urgency, deadline, reference link) and gets parsed into discrete tasks via Gemini.
- Auto-routing puts work into the right ClickUp list with `intake` tags so operators can filter at a glance.

## URLs

- **Public client form:** `/intake/<token>` (no auth, token-gated)
- **Operator command center:** `/modules/intake` (Active Set sign-in)

## Data model

| Doc | Where | Purpose |
|-----|-------|---------|
| `projects.{id}.intakeToken` | Firestore | URL-safe random token. Resolves the public URL → project |
| `projects.{id}.intakeEnabled` | Firestore | Master kill switch |
| `projects.{id}.intakeAutoCreate` | Firestore | If true, AI-parses the message and creates ClickUp tasks immediately |
| `projects.{id}.intakeWelcomeMessage` | Firestore | Optional client-facing blurb shown above the form |
| `requests.{id}` | Firestore | Raw submission blob (audit trail). `source: 'intake'` |
| `tasks.{id}` | Firestore | Mirror of any tasks created from the submission. `source: 'intake'` + `requestId` link |

The same `requests` collection is used by the existing operator paste/Slack/email flows — see [`/components/tasks/NewRequestDialog.tsx`](../../src/components/tasks/NewRequestDialog.tsx).

## Routing modes

| Mode | When to use |
|------|-------------|
| **Auto-route** (`intakeAutoCreate = true`) | Subscription clients with a defined ClickUp list. Bundled lists get split via Gemini into N tasks. |
| **Triage queue** (`intakeAutoCreate = false`) | One-time projects, new client trials. Submissions stage as `requests` for the operator to triage. |

Auto-route requires the project to already have a `clickupListId` — link a list from the project's Tasks tab first.

## API

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/clickup/public-intake` | Token-gated (no Firebase auth) | Public form submission |
| `GET /api/clickup/intake-settings?projectId=…` | Active Set domain | Read settings |
| `POST /api/clickup/intake-settings` | Active Set domain | Toggle, rotate token, set welcome message |
| `GET /api/clickup/dashboard` | Active Set domain | Cross-client health snapshot |

### Public intake submission contract

```jsonc
POST /api/clickup/public-intake
{
  "token": "<intakeToken>",
  "payload": {
    "requesterName": "Jane Smith",
    "requesterEmail": "jane@company.com",
    "message": "1. Fix footer logo\n2. Update homepage hero copy …",
    "isList": true,
    "urgency": "medium",
    "deadline": "2026-05-15",
    "referenceUrl": "https://www.loom.com/…"
  }
}

→ 200
{
  "success": true,
  "requestId": "…",
  "tasksCreated": 2,
  "taskUrls": ["https://app.clickup.com/t/abc", "…"],
  "message": "Thanks — 2 tasks created and assigned for review."
}
```

## Token lifecycle

- Generated via `crypto.randomBytes(32)` → 32+ char URL-safe base64 (`src/lib/intake-token.ts`)
- Rotated from the operator command center → old URL stops working immediately
- Disabled via the Public intake toggle (token preserved, but submissions return 403)

## AI parsing

Reuses the same Gemini-2.5-Flash setup as `/api/tasks/parse-request`, with a tighter prompt focused on bundled-list splitting. Skipped automatically when `isList=false` or message length < 80 chars (fallback: single task).

Cap: 25 tasks per submission. Input cap: 20,000 chars.

## Discoverability

- New module card on the home dashboard (`Inbox` icon, amber tone)
- Operator command center has a "pain-sorted" table — projects with the most blocked / aging / untriaged work bubble to the top
- Existing webhook + drift cron continue to keep `tasks` mirror in sync, so the dashboard reflects real ClickUp state

## Setup checklist

1. **Per-project once:** open the project, link a ClickUp list (existing flow on the Tasks tab)
2. **Per-project once:** in `/modules/intake`, click Configure → toggle "Public intake" on
3. **Per-project once (optional):** toggle "Auto-route to ClickUp" if you want submissions to bypass triage
4. **Per-project once (optional):** customize the welcome message
5. **Share:** copy the `/intake/<token>` URL to the client (email signature, project portal, etc.)
6. **Rotate any time:** if a URL leaks or a relationship ends, rotate from the same panel

## What this replaces

- Paid ClickUp guest seats for clients who only need to drop requests
- The Word-doc brief attachment workflow for routine change requests
- Slack/email forwarding chains for "I have a list of changes for the website"
- Manual operator triage of obvious single-task asks
