# Project Context: Project Links Widget

## Overview
This project is an **embeddable JavaScript widget** and dashboard for managing project links, proposals, and Webflow page SEO. It allows agencies to provide a client portal experiene.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: Shadcn UI + Tailwind CSS 4
- **Database**: Firebase Firestore (Real-time)
- **Auth**: Firebase Auth
- **AI**: Google Gemini (via `@google/genai`)

## Core Modules

### 1. Project Links
- CRUD for text/image links.
- Drag-and-drop reordering.
- Real-time updates via Firestore listeners.

### 2. Proposal Generator
A comprehensive system for managing the full lifecycle of client proposals.
- **AI Engine**: Full proposal generation from meeting notes and block-level editing.
- **Collaboration**: Real-time commenting system and version history tracking.
- **Client Flow**: Public sharing URLs with electronic signature capture.
- **Output**: High-fidelity, print-optimized PDF generation matching the browser view.
- **Dashboard**: Sorting, grouping, and template library for team efficiency.

### 3. Webflow Pages Manager (New!)
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

## Conventions
- **SEO Data**: Stored in `seo` (WebflowSEO) and `openGraph` (WebflowOpenGraph) objects.
- **Validation**: Zod schemas used for form validation.
- **Environment**: API keys must be secure (server-side only for Webflow/Gemini).
