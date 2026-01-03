---
trigger: always_on
---

# Shadcn & UI Conventions

## Core Principles

- **Framework**: We use Shadcn UI (Radix UI bases).
- **Styling**: Tailwind CSS 4 is used. Avoid legacy utility patterns if modern V4 patterns are available.
- **Components**: Always look in `src/components/ui/` before creating a new base component.

## Adding Components

When adding a new Shadcn component, use the CLI:
```bash
npx shadcn@latest add [component-name]
```

## Customization

- Keep customizations inside the component file unless they are global.
- Use `cn()` utility for merging classes.
- Ensure all interactive elements have unique IDs for browser testing.

## Layout Patterns

- Use `lucide-react` for icons.
- Prefer `Flex` and `Grid` for structural layouts.
- Follow the existing dark theme tokens.