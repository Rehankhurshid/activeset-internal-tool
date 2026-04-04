# Modular Monolith

## Goals

- Keep all public routes and API shapes stable while migrating feature ownership into `src/modules/*`.
- Centralize cross-cutting infrastructure in `src/platform/*`.
- Reserve `src/shared/*` for presentation-only UI and framework-agnostic utilities.
- Eliminate direct imports between module internals; compose modules only through their `index.ts` public APIs.

## Top-Level Layout

```text
src/
  app/                  # public Next.js route entrypoints only
  modules/              # feature-owned code
  platform/             # Firebase, auth, notifications, external clients
  shared/               # reusable UI primitives and generic helpers
```

Each module follows the same template:

```text
src/modules/<module>/
  application/
  domain/
  infrastructure/
  server/
  ui/
  index.ts
```

## Dependency Rules

- `src/app/**/page.tsx` may import from:
  - module `index.ts` files
  - `src/shared/*`
  - `src/platform/*`
  - generic UI primitives under `src/components/ui/*`
- `src/modules/<module>/**` may import:
  - itself
  - `src/shared/*`
  - `src/platform/*`
  - other modules only through `@/modules/<name>`
- `src/modules/<module>/**` may not import:
  - another module's internals
  - compatibility shims under `src/hooks/*`, `src/components/navigation/*`, `src/components/auth/*`, and the moved legacy feature entry files

## Compatibility Strategy

- Legacy paths such as `src/hooks/useAuth.ts` and `src/components/navigation/AppNavigation.tsx` are compatibility shims.
- New code should import from the module/shared public surface instead.
- Repositories in `src/modules/*/infrastructure` are the temporary bridge to legacy services like `src/services/database.ts`.

## Current Module Ownership

- `auth-access`: auth hooks, login UI, access checks
- `project-links`: project dashboards, project shells, share-link orchestration
- `site-monitoring`: audit dashboards, page detail views, text checks
- `webflow`: Webflow dashboards and config persistence adapters
- `checklists`: checklist overview, editor, template list, creator screen
- `proposal`: proposal module screen over the current proposal implementation
- `seo-engine`: SEO engine screen
- `screenshot-runner`: screenshot runner screen
- `settings`: settings components public surface

## Quality Gates

- `npm run typecheck`
- `npm run lint:architecture`
- `npm run arch:check`

These checks are intended to run in CI once the branch is stable enough to enforce them repo-wide.
