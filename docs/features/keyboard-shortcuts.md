# Keyboard shortcuts & app shell

The app shell is keyboard-first, in the style of Superhuman: a slim icon rail on
the left, a thin page header, a ⌘K command palette and a hint bar along the
bottom that teaches the shortcuts that work on the current page.

## Where things live

| Piece | File |
|-------|------|
| Shortcut registry (`useShortcut`, chords, help data) | `src/shared/keyboard/shortcuts.tsx` |
| Keycaps (`<Kbd>`, `<KeyCombo keys="g p" />`) | `src/shared/keyboard/Kbd.tsx` |
| `?` help sheet | `src/shared/keyboard/ShortcutHelp.tsx` |
| j / k / Enter list cursor | `src/shared/keyboard/useListNavigation.ts` |
| Left rail, hint bar, frame | `src/components/shell/` |
| Module list (single source for rail, sheet, palette, home) | `src/components/shell/nav-items.tsx` |
| Page header | `src/shared/ui/AppNavigation.tsx` |
| ⌘K palette | `src/components/CommandPalette.tsx` |
| "Recent opens" on the home screen | `src/lib/recent-projects.ts` |

Icons in the shell come from [Phosphor](https://phosphoricons.com) (MIT). Feature
modules still use Lucide (ISC); both are open source and visually compatible.

## Adding a shortcut

```tsx
import { useShortcut } from '@/shared/keyboard';

useShortcut({
  id: 'invoices-new',        // stable id; last registration with the same keys wins
  keys: 'n',                 // 'n' | 'mod+k' | 'g p' (chord) | ['j', 'down'] (aliases)
  label: 'New invoice',      // shown in the ? sheet and, with hint: true, the hint bar
  group: 'Actions',          // General | Navigation | Lists | Projects | Project | Actions
  hint: true,                // surface in the bottom bar (last three registered are shown)
  handler: () => setOpen(true),
});
```

Shortcuts never fire while typing in a field unless they carry a modifier or
set `allowInInput: true`. `Escape` inside a field blurs the field; elsewhere it
goes back to the page's `backHref`.

## Global bindings

| Keys | Action |
|------|--------|
| `⌘K` or `/` | Command palette |
| `?` or `⌘/` | Shortcut sheet |
| `g` then `h` / `p` / `o` / `s` / `t` / `c` | Home · Projects · Proposals · Screenshot Runner · Tools · Checklists |
| `⌘⇧L` | Toggle light / dark |
| `Esc` | Back |

Home: `1`–`5` open a module, `j`/`k` + `Enter` walk the list.
Projects: `n` new, `/` search, `v` grid/list, `c` group by client, `1`–`7` status filter, `j`/`k` + `Enter` open a card.
Project: `[` / `]` previous/next tab, `1`–`9` jump to a tab, `s` share the client portal link, `c` copy the client portal link, `e` embed.
