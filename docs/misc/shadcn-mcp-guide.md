# Shadcn UI with MCP Server - Complete Guide

## Overview

The shadcn MCP (Model Context Protocol) server provides AI assistants with direct access to the shadcn/ui component registry, enabling intelligent UI component suggestions, installations, and best practices verification.

## How shadcn MCP Works

### 1. **MCP Server Features** (as of v3.0)
- **Namespaced Registries**: Install components using `@registry/name` format
- **Private Registries**: Secure your registry with authentication
- **Search & Discovery**: Find and view components before installing
- **Universal Registry Items**: Distribute code to any project
- **Zero-config integration**: Works with all registries automatically

### 2. **Available MCP Tools**

When the shadcn MCP server is configured, AI assistants can:

```bash
# View items from registry
npx shadcn view @acme/auth-system

# Search components
npx shadcn search @tweakcn -q "dark"

# List all items from a registry
npx shadcn list @acme

# Add components
npx shadcn add button card dialog
```

### 3. **Using shadcn MCP for UI Design**

#### Component Discovery
The MCP server allows AI to:
- Search for appropriate components based on requirements
- Preview component code before installation
- Check dependencies and compatibility
- Suggest related components

#### Automated Installation
```bash
# AI can automatically install required components
npx shadcn add @shadcn/card @v0/chart @acme/data-table
```

#### Theme and Style Management
- Apply consistent theming with CSS variables or Tailwind utilities
- Manage light/dark mode transitions
- Customize component variants

## Best Practices with shadcn MCP

### 1. **Component Selection**
- Use semantic component names
- Prefer shadcn primitives over custom implementations
- Leverage component composition

### 2. **Styling Guidelines**
- Use CSS variables for theming: `bg-background text-foreground`
- Apply consistent spacing with Tailwind utilities
- Implement responsive design with breakpoint prefixes

### 3. **Accessibility**
- All shadcn components include ARIA attributes
- Keyboard navigation support built-in
- Focus management handled automatically

### 4. **Performance**
- Components use React.memo where appropriate
- Lazy loading for heavy components
- Tree-shakeable imports

## UI Verification Checklist

### Component Usage
- [ ] Using shadcn components instead of custom implementations
- [ ] Proper component composition and nesting
- [ ] Correct prop usage and types

### Styling
- [ ] Consistent use of theme variables
- [ ] Responsive design implementation
- [ ] Dark mode support

### Code Quality
- [ ] TypeScript types properly defined
- [ ] No duplicate component implementations
- [ ] Following React best practices

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader support
- [ ] Focus indicators visible

## Common Patterns

### 1. **Form with Validation**
```tsx
// Use shadcn form components with react-hook-form
import { Form, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
```

### 2. **Modal Dialogs**
```tsx
// Use Dialog for modals
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog"
```

### 3. **Data Display**
```tsx
// Use Card for content containers
import { Card, CardHeader, CardContent } from "@/components/ui/card"
// Use Table for tabular data
import { Table, TableBody, TableCell } from "@/components/ui/table"
```

### 4. **Navigation**
```tsx
// Use NavigationMenu for nav bars
import { NavigationMenu, NavigationMenuItem } from "@/components/ui/navigation-menu"
// Use Sheet for mobile menus
import { Sheet, SheetContent } from "@/components/ui/sheet"
```

## Integration with Your Project

### Current Implementation Status
Your project already uses several shadcn components:
- Alert Dialog for confirmations
- Buttons with variants
- Cards for project display
- Dropdowns for actions
- Tabs for organization

### Recommended Additions
Based on your refactored code:
- **Toast/Sonner**: For better error notifications
- **Form**: For structured form handling
- **Skeleton**: For loading states
- **Badge**: For status indicators
- **Progress**: For async operations

## MCP Server Configuration

Your project has the shadcn MCP server configured:
```json
// Added via: claude mcp add --transport http shadcn https://www.shadcn.io/api/mcp
```

This enables AI assistants to:
1. Automatically suggest appropriate components
2. Generate component implementations
3. Verify UI best practices
4. Ensure consistent styling

## Next Steps

1. **Use the UI Verification Agent** (see ui-verification-agent.md)
2. **Audit existing components** for shadcn alternatives
3. **Implement missing UI patterns** with shadcn components
4. **Standardize theming** across all components