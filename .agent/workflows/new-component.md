---
description: Follow these steps to create a new UI component for the widget or dashboard.
---

# New Component Workflow

Follow these steps to create a new UI component for the widget or dashboard.

## Steps

1. **Check for existing components**
   Look in `src/components/ui/` for any existing Radix/Shadcn components that can be reused.

2. **Add base component (if missing)**
   If the base component is not in the project, add it via shadcn CLI:
   ```bash
   npx shadcn@latest add [component-name]
   ```

3. **Create the feature component**
   Create a new `.tsx` file in `src/components/[feature-folder]/`.
   - Use `'use client'` if it requires interactivity.
   - Use `Zod` if there are inputs.
   - Use `lucide-react` for icons.

4. **Export and Integrate**
   Export the component and integrate it into the relevant page or layout in `src/app/`.
