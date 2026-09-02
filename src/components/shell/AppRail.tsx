'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Keyboard, Lock, Moon, SignOut, Sun } from '@phosphor-icons/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/modules/auth-access';
import { KeyCombo, useOpenShortcutHelp, useShortcut } from '@/shared/keyboard';
import { cn } from '@/lib/utils';
import { isNavItemActive, useNavItems, type ResolvedNavItem } from './nav-items';

function RailItem({ item }: { item: ResolvedNavItem }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = isNavItemActive(item, pathname);
  const locked = !item.loading && !item.hasAccess;
  const Icon = item.icon;

  useShortcut({
    id: `nav:${item.href}`,
    keys: item.keys,
    label: `Go to ${item.label}`,
    group: 'Navigation',
    enabled: !locked,
    handler: () => router.push(item.href),
  });

  const button = (
    <Link
      href={locked ? '#' : item.href}
      aria-disabled={locked}
      aria-current={active ? 'page' : undefined}
      data-active={active}
      onClick={(e) => locked && e.preventDefault()}
      className={cn(
        'relative flex size-10 items-center justify-center rounded-lg transition-colors duration-100',
        'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-primary',
        'before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity',
        'data-[active=true]:before:opacity-100',
        locked && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
    >
      {locked ? <Lock className="size-5" /> : <Icon className="size-5" weight={active ? 'fill' : 'regular'} />}
      <span className="sr-only">{item.label}</span>
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="flex items-center gap-3">
        <span>{locked ? `${item.label} · no access` : item.label}</span>
        {!locked && <KeyCombo keys={item.keys} />}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const toggle = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  useShortcut({
    id: 'theme-toggle',
    keys: 'mod+shift+l',
    label: 'Toggle light / dark',
    group: 'General',
    allowInInput: true,
    handler: toggle,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          className="flex size-10 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Toggle theme"
        >
          <Sun className="size-5 dark:hidden" />
          <Moon className="hidden size-5 dark:block" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="flex items-center gap-3">
        <span>Toggle theme</span>
        <KeyCombo keys="mod+shift+l" />
      </TooltipContent>
    </Tooltip>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const openHelp = useOpenShortcutHelp();
  if (!user) return null;
  const initials = (user.displayName ?? user.email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account"
        >
          <Avatar className="size-7 ring-1 ring-border">
            {user.photoURL && <AvatarImage src={user.photoURL} alt="" />}
            <AvatarFallback className="bg-primary/15 text-[11px] font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={12} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.displayName ?? 'Signed in'}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openHelp} className="justify-between">
          <span className="flex items-center gap-2">
            <Keyboard className="size-4" /> Keyboard shortcuts
          </span>
          <KeyCombo keys="?" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()} className="text-destructive focus:text-destructive">
          <SignOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The slim icon rail on the left, Superhuman-style. Desktop only; the mobile
 * sheet in AppNavigation lists the same items. The `g` chords live here so
 * they are registered exactly once per page.
 */
export function AppRail() {
  const items = useNavItems();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--shell-rail)] flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:flex"
      aria-label="Primary"
    >
      <Link
        href="/"
        className="mb-3 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.55_0.22_310)] text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105"
        aria-label="Activeset home"
      >
        A
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {items.map((item) => (
          <RailItem key={item.href} item={item} />
        ))}
      </nav>
      <div className="flex flex-col items-center gap-1">
        <ThemeButton />
        <UserMenu />
      </div>
    </aside>
  );
}
