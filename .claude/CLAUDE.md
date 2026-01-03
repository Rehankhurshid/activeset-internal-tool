# Project Links Widget - Agent Instructions

## Project Overview

This is a Next.js 16 application for managing project links, website auditing, and Webflow integration. It uses Firebase for authentication and data storage, and Tailwind CSS with shadcn/ui for the UI.

## Key Features

### 1. Project Links Management
- Create and manage projects with multiple links
- Embed widget on external sites (Webflow, Framer)
- Real-time updates via Firebase subscriptions

### 2. Website Audit Dashboard
- Scan sitemaps for pages
- Audit content for spelling, readability, SEO, and technical issues
- Track content changes over time

### 3. Webflow Pages Management
- Connect Webflow sites via API
- List and manage static pages
- SEO health scoring and QC checks
- Edit SEO metadata (title, description, Open Graph)

**Documentation:** [docs/features/webflow-pages.md](../docs/features/webflow-pages.md)

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication (Google Sign-In)
- **AI:** Google Gemini API (for content auditing)

## Project Structure

```
src/
├── app/
│   ├── api/                 # API routes
│   │   ├── webflow/         # Webflow API proxy
│   │   ├── audit/           # Content auditing
│   │   └── ...
│   ├── modules/             # Feature modules
│   │   ├── project-links/   # Main project management
│   │   ├── proposal/        # Proposal generation
│   │   └── settings/        # Admin settings
│   └── ...
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── projects/            # Project-related components
│   ├── webflow/             # Webflow feature components
│   └── ...
├── services/
│   ├── database.ts          # Firebase CRUD operations
│   ├── WebflowService.ts    # Webflow SEO analysis
│   ├── AuditService.ts      # Audit logging
│   └── ...
├── hooks/                   # Custom React hooks
├── types/                   # TypeScript type definitions
└── lib/                     # Utilities and config
```

## Documentation

Feature documentation is located in `/docs/features/`:

| Feature | Documentation |
|---------|--------------|
| Webflow Pages | [docs/features/webflow-pages.md](../docs/features/webflow-pages.md) |

API documentation is in `/docs/misc/`:

| API | Documentation |
|-----|--------------|
| Webflow Pages API | [docs/misc/webflow/pages/](../docs/misc/webflow/pages/) |

## Database Collections

| Collection | Purpose |
|------------|---------|
| `projects` | User projects with links array and webflowConfig |
| `audit_logs` | Website audit history |
| `configurations` | Settings (agencies, services, terms, etc.) |
| `access_control` | Module access permissions |

## Common Patterns

### API Routes
- Located in `/src/app/api/`
- Use `NextRequest`/`NextResponse` from `next/server`
- External API tokens passed via headers (e.g., `x-webflow-token`)

### Services
- Located in `/src/services/`
- Export object with async methods
- Example: `projectsService.createProject(userId, name)`

### Hooks
- Located in `/src/hooks/`
- Follow `use[Feature]` naming convention
- Handle loading, error, and data states

### Components
- Use shadcn/ui components from `/src/components/ui/`
- Feature components organized by folder (e.g., `/webflow/`)
- Use `sonner` for toast notifications

## Environment Variables

```
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# AI
GEMINI_API_KEY

# Email
GMAIL_USER
GMAIL_APP_PASSWORD
NOTIFY_EMAIL
```

## Access Control

- Authentication: Firebase Auth with Google Sign-In
- Email restriction: Only `@activeset.co` emails allowed
- Module access: Controlled via `access_control` collection
- Admin: `rehan@activeset.co`
