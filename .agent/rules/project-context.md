---
trigger: always_on
---

# Project Links Widget - Core Context

## Project Overview

This is an **embeddable JavaScript widget** for managing and displaying project links with real-time collaboration. Built with Next.js 16, Shadcn UI, Firebase, and dnd-kit.

## Technology Stack

- **Framework**: Next.js 16 with App Router (uses Turbopack for dev)
- **Language**: TypeScript (strict mode)
- **UI Library**: Shadcn UI + Radix UI primitives
- **Styling**: Tailwind CSS 4
- **Database**: Firebase Firestore (real-time listeners)
- **Authentication**: Firebase Auth (Google OAuth, restricted to @activeset.co emails)
- **Drag & Drop**: @dnd-kit
- **Rich Text**: Lexical + TipTap editors
- **AI Integration**: Google Gemini (@google/genai)

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── api/          # API routes
│   └── embed/        # Embeddable widget pages
├── components/       # React components
│   ├── ui/           # Shadcn UI components
│   └── [feature]/    # Feature-specific components
├── hooks/            # Custom React hooks
├── lib/              # Utilities, Firebase config
├── services/         # Database/API services
├── types/            # TypeScript type definitions
└── widget/           # Embeddable widget source

public/
└── widget.js         # Standalone embed script
```

## Key Modules

1. **Link Management**: CRUD for project links with drag-and-drop reordering
2. **Proposal Generator**: AI-powered proposal creation
3. **Audit Dashboard**: Content auditing with LanguageTool integration
4. **Sitemap Scanner**: Automated sitemap discovery and analysis

## Code Conventions

- Use `'use client'` directive for client components
- Prefer async/await over `.then()` chains
- Use Zod for runtime validation with `react-hook-form`
- Firebase services are in `src/services/`
- Shadcn components are in `src/components/ui/`