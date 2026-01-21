# Webflow Team Tracker Extension

A Chrome extension for tracking who is using shared Webflow accounts in real-time. Designed for teams that share Webflow login credentials.

## Overview

| Property | Value |
|----------|-------|
| **Name** | Webflow Team Tracker |
| **Version** | 1.0.1 |
| **Manifest Version** | 3 |
| **Location** | `public/webflow-tracker/` |
| **Backend API** | `https://app.activeset.co/api/webflow/session` |

## Problem Solved

When teams share Webflow account credentials, there's no built-in way to know:
- Who is currently logged into which account
- What project someone is working on
- When someone logs out (or gets kicked out)

This extension solves this by tracking active sessions and broadcasting them to all team members.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chrome Extension                             │
├─────────────────┬─────────────────────┬─────────────────────────┤
│   content.js    │    background.js    │       popup.js          │
│   (Detection)   │    (Messaging)      │       (UI)              │
├─────────────────┴─────────────────────┴─────────────────────────┤
│                              ↓↑                                  │
│              API: POST/GET /api/webflow/session                 │
│                              ↓↑                                  │
│                   Firebase Firestore                            │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
public/webflow-tracker/
├── manifest.json    # Extension configuration
├── background.js    # Service worker (heartbeat, API communication)
├── content.js       # Page detection logic (runs on Webflow)
├── popup.html       # Extension popup UI
├── popup.js         # Popup logic & API fetching
├── icon16.png       # 16x16 icon
├── icon48.png       # 48x48 icon
└── icon128.png      # 128x128 icon
```

---

## Components

### 1. Manifest (`manifest.json`)

Defines the extension configuration for Chrome.

**Permissions:**
| Permission | Purpose |
|------------|---------|
| `storage` | Store user name, session state locally |
| `alarms` | Schedule periodic heartbeats |
| `tabs` | Query open Webflow tabs for heartbeat logic |

**Host Permissions:**
- `https://webflow.com/*` - Main Webflow domain
- `https://*.design.webflow.com/*` - Webflow Designer subdomains

---

### 2. Content Script (`content.js`)

Runs on all Webflow pages to detect user state and activity.

#### Key Functions

| Function | Description |
|----------|-------------|
| `extractEmail()` | Parses Webflow's `#wf-initial-data` script to extract logged-in email |
| `extractProjectAndPage()` | Determines current project/page from URL and DOM |
| `isOnLoginPage()` | Detects if user is on login page (logged out) |
| `handleLogin()` | Notifies background script of active session |
| `handleLogout()` | Releases session when logout detected |
| `monitorLogoutClicks()` | Watches for logout button clicks |

#### Email Extraction

The extension extracts the logged-in user's email from Webflow's embedded JSON:

```javascript
// Looks in multiple possible locations within #wf-initial-data
const email =
  data?.featureConfig?.identity?.privateAttributes?.email ||
  data?.hydrationData?.identity?.privateAttributes?.email ||
  data?.identity?.privateAttributes?.email;
```

#### Project/Page Detection

Detects context from various URL patterns:

| URL Pattern | Extracted Info |
|-------------|----------------|
| `*.design.webflow.com` | Project slug from subdomain + page from DOM |
| `/design/{project}` | Project from path |
| `/dashboard/sites/{site}` | Site ID |
| `/editor/{project}` | Project from path |
| `/dashboard/folder/{id}` | Folder ID |

#### Logout Detection Methods

1. **URL-based:** Detects `/login` path or login query params
2. **DOM-based:** Looks for Google login button or email input
3. **Click monitoring:** Intercepts clicks on logout links/buttons
4. **Kicked out detection:** Checks for `m=WW91` or `logged%20out` in URL

#### Safety Features

- Validates extension context before every operation
- Graceful cleanup when extension is invalidated
- Handles page navigation via MutationObserver

---

### 3. Background Script (`background.js`)

Service worker that handles API communication and heartbeats.

#### Key Functions

| Function | Description |
|----------|-------------|
| `sendSessionUpdate()` | POSTs session state to API |
| `handleHeartbeat()` | Periodic session refresh (every 30 seconds) |

#### Session Actions

| Action | When Sent | Effect |
|--------|-----------|--------|
| `claim` | User logs in or navigates | Marks account as in-use |
| `heartbeat` | Every 30 seconds (if Webflow tab open) | Keeps session alive |
| `release` | User logs out | Frees account for others |

#### API Request Format

```javascript
POST /api/webflow/session
{
  "email": "user@activeset.co",
  "userName": "John",
  "projectPath": "my-project / Home",
  "action": "claim" | "heartbeat" | "release"
}
```

#### Heartbeat Logic

- Runs every 30 seconds via Chrome Alarms API
- Only sends heartbeat if a Webflow tab is open
- Skips duplicate heartbeats (same email + project)
- Does NOT release session when tab closes (intentional design)

---

### 4. Popup UI (`popup.html` + `popup.js`)

User interface shown when clicking the extension icon.

#### Features

1. **Setup Flow:** First-time users enter their name
2. **Status Bar:** Shows current user's active account
3. **Account Grid:** Lists all known accounts with status

#### Seed Accounts

Hardcoded list of accounts always shown:
```javascript
const SEED_ACCOUNTS = [
  'rehan@activeset.co',
  'hello@activeset.co',
  'sanjay.rs@activeset.co',
  'arth@activeset.co'
];
```

#### Account Discovery

New accounts are discovered when:
1. A user logs into a new @activeset.co account
2. The API returns sessions with new emails

Discovered accounts are persisted in Chrome storage.

#### UI Update Cycle

- Refreshes every 5 seconds
- Fetches all sessions from `GET /api/webflow/session`
- Filters to only `@activeset.co` emails
- Shows online status (active within last 60 seconds)

#### Security

HTML output is escaped to prevent XSS:
```javascript
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

## Data Flow

### Login Flow

```
1. User opens webflow.com
2. content.js detects login via #wf-initial-data
3. content.js sends SESSION_UPDATE to background.js
4. background.js POSTs { action: "claim" } to API
5. API stores session in Firestore
6. Other users see update in popup
```

### Heartbeat Flow

```
1. Chrome alarm fires every 30 seconds
2. background.js checks for open Webflow tabs
3. If tab exists → POST { action: "heartbeat" }
4. Server updates lastActive timestamp
5. Popup shows "online" indicator for fresh sessions
```

### Logout Flow

```
1. User clicks logout OR navigates to /login
2. content.js detects logout state
3. content.js sends LOGOUT_DETECTED to background.js
4. background.js POSTs { action: "release" }
5. API marks session as released
6. Account shows "No one using" in popup
```

---

## Storage Schema

### Chrome Local Storage

| Key | Type | Description |
|-----|------|-------------|
| `userName` | string | User's display name |
| `currentEmail` | string | Currently logged-in Webflow email |
| `currentProject` | string | Current project/page path |
| `sessionState` | string | `"active"` or `"logged_out"` |
| `lastLogoutReason` | string | `"manual"` or `"kicked"` |
| `knownActivesetAccounts` | string[] | Discovered @activeset.co emails |

---

## API Endpoints

The extension communicates with the main app's backend.

### `POST /api/webflow/session`

Create/update/release a session.

**Request:**
```json
{
  "email": "user@activeset.co",
  "userName": "John",
  "projectPath": "my-project / Home",
  "action": "claim"
}
```

**Response:**
```json
{
  "success": true
}
```

### `GET /api/webflow/session`

Fetch all active sessions.

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "email": "rehan@activeset.co",
      "userName": "Rehan",
      "projectPath": "dashboard",
      "lastActive": { "_seconds": 1705000000 }
    }
  ]
}
```

---

## Design Decisions

### Why sessions persist on tab close

Unlike typical tracking, sessions are NOT released when:
- Browser tab is closed
- Browser is closed
- Computer sleeps

**Reason:** If someone claims an account, they might just switch to another app temporarily. Releasing on tab close would cause unnecessary "account free" notifications.

Sessions are only released on:
1. Explicit logout
2. Another user claims the same account
3. Server-side stale session cleanup (based on lastActive timestamp)

### Why filter to @activeset.co only

The extension is designed for a specific team's shared accounts. Filtering ensures:
- Only relevant accounts are tracked
- External/personal Webflow accounts are ignored
- Popup UI stays clean and focused

---

## Installation

### For Development

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `public/webflow-tracker` folder

### For Production

Package as `.crx` or distribute via Chrome Web Store (unlisted).

---

## Configuration

### Changing the API Endpoint

Edit the `API_BASE` constant in both files:

**background.js:5**
```javascript
const API_BASE = 'https://app.activeset.co';
```

**popup.js:5**
```javascript
const API_BASE = 'https://app.activeset.co';
```

### Modifying Seed Accounts

Edit `SEED_ACCOUNTS` in **popup.js:8**:
```javascript
const SEED_ACCOUNTS = [
  'email1@domain.co',
  'email2@domain.co'
];
```

### Adjusting Heartbeat Interval

Edit `HEARTBEAT_INTERVAL_MINUTES` in **background.js:8**:
```javascript
const HEARTBEAT_INTERVAL_MINUTES = 0.5; // 30 seconds
```

---

## Troubleshooting

### Session not updating

1. Check Chrome console for `[Webflow Tracker]` logs
2. Verify the API endpoint is reachable
3. Ensure `userName` is set in extension popup

### Extension context invalidated

This happens when the extension is reloaded while Webflow is open. Solution: Refresh the Webflow page.

### Account not appearing

Only `@activeset.co` emails are tracked. Verify the logged-in email matches this domain.

---

## Related Files

| File | Purpose |
|------|---------|
| `src/app/api/webflow/session/route.ts` | Backend API handler |
| `WEBFLOW_TRACKER_PRD.md` | Product requirements document |

---

## Security Considerations

1. **No passwords stored:** Extension only reads email from page data
2. **Domain-restricted:** Only runs on Webflow domains
3. **XSS prevention:** All dynamic HTML is escaped
4. **HTTPS only:** API communication over secure connection
5. **Local storage:** User names stored locally, not transmitted to external servers
