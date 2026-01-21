# Product Requirements Document (PRD): Webflow Team Tracker

## 1. Executive Summary
The **Webflow Team Tracker** is a Chrome Extension designed for teams sharing generic Webflow accounts (e.g., `rehan@activeset.co`). It solves the "Who is using the account?" problem by mapping the specific Webflow account to the actual physical teammate using it (e.g., "Vishal is using rehan@activeset.co").

## 2. Problem Statement
-   **Context**: The team shares multiple Webflow login credentials.
-   **Pain Point**: It is impossible to know if an account is currently "busy" or being used by another teammate, leading to conflicts or kickoff interruptions.
-   **Goal**: Provide real-time visibility into which teammate is active on which Webflow account.

## 3. Solution Overview
A lightweight Chrome Extension that:
1.  Asks the user for their **Real Name** (one-time setup).
2.  **Automatically detects** which configured Webflow account is currently logged in.
3.  Reports this pairing (User + Account) to a central **Dashboard** and **Slack Channel**.

## 4. Key Features

### 4.1. Hybrid Identity Tracking
-   **Manual Input**: The extension popup asks "What is your name?" (Stored locally).
-   **Auto-Detection**: The extension automatically scans the Webflow Dashboard to identify the logged-in email address.
    -   **Constraint**: Only tracks emails ending in `@activeset.co`.
-   **Status UI**: Popup displays the user's name and the currently detected account (or "Not Logged In").

### 4.2. Robust Login/Logout Detection
-   **Login Detection**: Scans `https://webflow.com/dashboard` for user email pattern.
    -   *Logic*: Fetches dashboard HTML, Regex match for `email":"..."` or HTML-encoded variants.
-   **Logout Detection**:
    -   User explicitly clicking "Log Out" triggers an immediate session end.
    -   Visiting the login page or homepage triggers a session end.
-   **Persistence**: Closing the browser tab **DOES NOT** end the session. The user remains "Active" on the dashboard until they explicitly log out or another user claims the account.

### 4.3. Real-Time Dashboard
-   **UI Component**: A list showing all generic accounts and who is using them.
-   **State**:
    -   **Active**: User is currently navigating Webflow.
    -   **Idle**: Tab is open but user hasn't interacted for >60s.
    -   **Offline**: Explicitly logged out.

### 4.4. Slack Integration
-   **Live Updates**: Posts a pinned message to a specific Slack channel.
-   **Format**:
    > 🟢 **Vishal**
    > *ACTIVE* on rehan@activeset.co
    > └ Project: /dashboard
-   **Tech**: Uses Slack Block Kit. Updates a single message in-place to avoid spam.

## 5. Technical Requirements

### 5.1. Chrome Extension (Manifest V3)
-   **Permissions**: `storage`, `alarms`, `host_permissions` (`*.webflow.com`).
-   **Content Script**:
    -   Runs on `webflow.com`.
    -   Injects no UI, only runs background detection logic.
    -   Uses `fetch` to read dashboard source for identity.
-   **Background Script**:
    -   Manages Heartbeat (30s interval).
    -   Handles "Force Update" events.
    -   Communicates with backend API.

### 5.2. Backend API (Next.js)
-   **Endpoint**: `POST /api/webflow/beat`
-   **Database**: Firebase Firestore (`active_sessions` collection).
-   **Logic**:
    -   Updates `lastActive` timestamp.
    -   Triggers Slack update if state changes significantly.

### 5.3. Slack Service
-   **Scope**: `chat:write`.
-   **Error Handling**: Must handle `token_revoked`, `missing_scope`, and `not_allowed_token_type` gracefully.

## 6. Success Metrics
-   Reduction in "Who is on the account?" Slack messages.
-   Accuracy of "Active" vs "Logged Out" states.
