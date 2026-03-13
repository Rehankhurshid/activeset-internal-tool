# ActiveSet Internal Tool — Documentation Overview

This repository contains the internal dashboard and embed tooling used by ActiveSet for:

- project link management,
- website audit tracking,
- AI-assisted checklist/proposal workflows,
- Webflow SEO and asset operations,
- local screenshot capture and visual diffing.

## Current Stack

- **Framework**: Next.js (App Router) + React 19
- **Language**: TypeScript
- **UI**: Tailwind CSS + shadcn/ui components
- **Data/Auth**: Firebase (Firestore + Auth) and Firebase Admin on server routes
- **AI integrations**: Google Gemini APIs used by selected `/api` endpoints

## Important App Areas

- `src/app` — app routes and API handlers.
- `src/components` — UI components for dashboards, checklists, QA, project links, and Webflow editors.
- `src/lib` — shared utilities (diffing, spell checking, validation, capture helpers, etc.).
- `src/local-capture` — local capture engine and tests.
- `public/widget.js` — embeddable widget script.
- `docs/features` — product/feature documentation.

## API Surface (high level)

The `src/app/api` folder includes endpoints for:

- project CRUD and checklist operations,
- audit saving and retrieval,
- scan orchestration (`scan-pages`, `scan-sitemap`, bulk scan routes),
- AI generation (`ai-gen`, `ai-gen-block`, `ai-seo-gen`, `ai-checklist`),
- Webflow operations (session, pages, assets, collections, token validation),
- image comparison and visual diffing,
- utility endpoints such as notifications and PDF generation.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env.local`.
   - Do **not** commit real secrets or production API keys.
   - Keep client-safe Firebase values under `NEXT_PUBLIC_*` keys.
   - Keep server secrets (Gemini, admin credentials, SMTP, etc.) server-side only.

3. Start the app:

```bash
npm run dev
```

4. Optional checks:

```bash
npm run lint
npm run test:local-capture
```

## Embedding

The embeddable script is served from `public/widget.js` and can be embedded via `<script src=".../widget.js">` with data attributes, or by using the `/embed` route depending on integration needs.

## Notes

- If documentation in `docs/features` diverges from implementation, prefer code as source of truth and update the feature doc in the same PR.
- Avoid storing real credentials in Markdown examples.
