'use client';

import { useEffect, useMemo, useState } from 'react';
import { Keyboard } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KeyCombo } from './Kbd';
import { useShortcut, useShortcuts, type Shortcut, type ShortcutGroup } from './shortcuts';

const GROUP_ORDER: ShortcutGroup[] = ['General', 'Navigation', 'Lists', 'Projects', 'Project', 'Actions'];

/**
 * The `?` overlay. Lists every live shortcut, grouped, so whatever page the
 * user is on the sheet always matches what actually works right now.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const shortcuts = useShortcuts();

  useShortcut({
    id: 'help-open',
    keys: ['?', 'mod+/'],
    label: 'Show keyboard shortcuts',
    group: 'General',
    handler: () => setOpen((o) => !o),
  });

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('shortcuts:help', onOpen);
    return () => window.removeEventListener('shortcuts:help', onOpen);
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map<ShortcutGroup, Shortcut[]>();
    for (const s of shortcuts) {
      if (s.hidden || s.enabled === false) continue;
      const g = s.group ?? 'General';
      const list = byGroup.get(g) ?? [];
      // Later registrations override earlier ones with the same keys: show only the winner.
      const dupe = list.findIndex((x) => x.keys[0] === s.keys[0]);
      if (dupe >= 0) list.splice(dupe, 1);
      list.push(s);
      byGroup.set(g, list);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [shortcuts]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden bg-popover">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-5 text-primary" weight="duotone" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Everything works from the keyboard. Press <KeyCombo keys="?" /> anywhere to open this sheet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-10 gap-y-6 px-6 py-5 sm:grid-cols-2 max-h-[65vh] overflow-y-auto">
          {groups.map(({ group, items }) => (
            <section key={group} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group}
              </h3>
              <ul className="divide-y divide-border/60">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 py-1.5 text-sm">
                    <span className="text-foreground/90">{s.label}</span>
                    <span className="flex items-center gap-1.5">
                      {s.keys.slice(0, 2).map((k, i) => (
                        <span key={k} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-[10px] text-muted-foreground/60">or</span>}
                          <KeyCombo keys={k} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
