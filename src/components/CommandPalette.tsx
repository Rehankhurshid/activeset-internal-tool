'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Buildings,
  FolderSimple,
  Keyboard,
  Lock,
  Moon,
  Plugs,
  Plus,
  Receipt,
  SignOut,
  Sun,
} from '@phosphor-icons/react';

import { useAuth } from '@/hooks/useAuth';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import type { Project } from '@/types';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Kbd, KeyCombo, useOpenShortcutHelp, useShortcut } from '@/shared/keyboard';
import { useNavItems } from '@/components/shell/nav-items';

/**
 * ⌘K. Navigation, actions and a live project search in one place. Mounted once
 * in AppFrame; other components open it by dispatching `commandk:open`.
 */
export function CommandPalette() {
  const { user, isAdmin, logout } = useAuth();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const navItems = useNavItems();
  const openHelp = useOpenShortcutHelp();

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  useShortcut({
    id: 'palette-toggle',
    keys: 'mod+k',
    label: 'Command palette',
    group: 'General',
    allowInInput: true,
    enabled: !!user,
    handler: () => setOpen((o) => !o),
  });
  useShortcut({
    id: 'palette-search',
    keys: '/',
    label: 'Search',
    group: 'General',
    enabled: !!user,
    handler: () => setOpen(true),
  });

  useEffect(() => {
    if (!user) return;
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('commandk:open', onOpenEvent);
    return () => window.removeEventListener('commandk:open', onOpenEvent);
  }, [user]);

  // Subscribe to the project list only while the palette is open — fresh each
  // time, no persistent app-wide listener.
  useEffect(() => {
    if (!open || !user) return;
    const unsub = projectLinksRepository.subscribeToAllProjects((list) => {
      setProjects(list);
      setLoaded(true);
    });
    return () => unsub();
  }, [open, user]);

  const run = (fn: () => void) => {
    setOpen(false);
    // Let the dialog close before navigating so focus restores cleanly.
    setTimeout(fn, 0);
  };

  const actions = useMemo(
    () => [
      {
        id: 'new-project',
        label: 'New project',
        icon: Plus,
        keys: 'n',
        hint: 'on Projects',
        run: () => router.push('/modules/project-links?new=1'),
      },
      {
        id: 'theme',
        label: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: resolvedTheme === 'dark' ? Sun : Moon,
        keys: 'mod+shift+l',
        run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'help', label: 'Keyboard shortcuts', icon: Keyboard, keys: '?', run: openHelp },
      { id: 'signout', label: 'Sign out', icon: SignOut, run: () => logout() },
    ],
    [logout, openHelp, resolvedTheme, router, setTheme],
  );

  if (!user) return null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command"
      description="Jump anywhere, run an action or open a project"
      className="top-[12vh] translate-y-0 sm:max-w-2xl border-border/60 bg-popover shadow-2xl shadow-black/40"
      showCloseButton={false}
    >
      <CommandInput placeholder="Type a command or search projects…" className="text-base" />
      <CommandList className="max-h-[52vh]">
        <CommandEmpty>{loaded ? 'Nothing matches.' : 'Loading…'}</CommandEmpty>

        <CommandGroup heading="Go to">
          {navItems.map((item) => {
            const locked = !item.loading && !item.hasAccess;
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={`go ${item.label}`}
                disabled={locked}
                onSelect={() => run(() => router.push(item.href))}
              >
                {locked ? <Lock /> : <Icon />}
                <span>{item.label}</span>
                <span className="ml-auto flex items-center gap-2">
                  {locked ? (
                    <span className="text-xs text-muted-foreground">No access</span>
                  ) : (
                    <KeyCombo keys={item.keys} />
                  )}
                </span>
              </CommandItem>
            );
          })}
          {isAdmin && (
            <>
              <CommandItem value="go clickup settings" onSelect={() => run(() => router.push('/modules/clickup-settings'))}>
                <Plugs />
                <span>ClickUp settings</span>
              </CommandItem>
              <CommandItem value="go refrens settings invoices" onSelect={() => run(() => router.push('/modules/refrens-settings'))}>
                <Receipt />
                <span>Refrens settings</span>
              </CommandItem>
            </>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem key={a.id} value={`action ${a.label}`} onSelect={() => run(a.run)}>
                <Icon />
                <span>{a.label}</span>
                {a.keys && (
                  <span className="ml-auto flex items-center gap-2">
                    {'hint' in a && a.hint && <span className="text-[10px] text-muted-foreground/70">{a.hint}</span>}
                    <KeyCombo keys={a.keys} />
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={`Projects${projects.length ? ` · ${projects.length}` : ''}`}>
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              // Include the id so items with duplicate name+client stay distinct
              // for cmdk; filtering still matches on name/client substrings.
              value={`${project.name} ${project.client ?? ''} ${project.id}`}
              onSelect={() => run(() => router.push(`/modules/project-links/${project.id}`))}
            >
              <FolderSimple />
              <span className="truncate">{project.name}</span>
              {project.client && (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Buildings className="size-3" />
                  {project.client}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>

      <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> select
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> close
        </span>
        <span className="ml-auto hidden items-center gap-1.5 sm:flex">
          <KeyCombo keys="g" /> <span>then a letter jumps straight there</span>
        </span>
      </div>
    </CommandDialog>
  );
}
