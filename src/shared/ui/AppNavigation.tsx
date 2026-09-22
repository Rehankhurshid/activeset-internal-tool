'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CaretLeft, List, Lock, MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useAuth } from '@/modules/auth-access';
import { Kbd, KeyCombo, isTypingTarget, useShortcut } from '@/shared/keyboard';
import { isNavItemActive, useNavItems } from '@/components/shell/nav-items';
import { ScanActivityIndicator } from '@/components/navigation/ScanActivityIndicator';
import { WorkerActivityIndicator } from '@/components/navigation/WorkerActivityIndicator';
import { AlertIndicator } from '@/components/navigation/AlertIndicator';
import { cn } from '@/lib/utils';

interface AppNavigationProps {
  title?: string;
  showBackButton?: boolean;
  backHref?: string;
  children?: React.ReactNode;
  className?: string;
  /** Kept for call-site compatibility; module access now resolves inside the shell. */
  proposalAccess?: boolean;
  projectLinksAccess?: boolean;
  accessLoading?: boolean;
}

/** True while any overlay (dialog, menu, popover, sheet) is open. */
function overlayIsOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-slot="popover-content"][data-state="open"]',
  );
}

/**
 * The slim page header. Navigation between modules lives in the rail (desktop)
 * or the sheet behind the menu button (mobile); this bar carries the page
 * title, a back affordance and per-page actions passed as children.
 */
export function AppNavigation({
  title,
  showBackButton = false,
  backHref = '/',
  children,
  className,
}: AppNavigationProps) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useShortcut({
    id: 'nav-back',
    keys: 'escape',
    label: 'Back',
    group: 'Navigation',
    enabled: showBackButton,
    handler: (e) => {
      // Esc inside a field just leaves the field, like Superhuman's search box.
      if (isTypingTarget(e.target)) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (overlayIsOpen()) return;
      router.push(backHref);
    },
  });

  if (loading || !user) return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 h-[var(--shell-header)] w-full border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        className,
      )}
    >
      <div className="flex h-full items-center gap-1.5 px-2 sm:px-4">
        <MobileMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />

        {showBackButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" asChild>
                <Link href={backHref} aria-label="Back">
                  <CaretLeft className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-2">
              Back <Kbd>Esc</Kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {title && (
          <h1 className="min-w-0 truncate px-1 text-sm font-medium tracking-tight sm:text-[15px]">{title}</h1>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {children}
          <WorkerActivityIndicator />
          <ScanActivityIndicator />
          <AlertIndicator />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.dispatchEvent(new Event('commandk:open'))}
            className="hidden h-8 gap-2 text-muted-foreground sm:inline-flex"
            aria-label="Open command palette"
          >
            <MagnifyingGlass className="size-4" />
            <span className="hidden lg:inline">Search</span>
            <KeyCombo keys="mod+k" className="hidden lg:inline-flex" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pathname = usePathname();
  const items = useNavItems();
  const { user, logout } = useAuth();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 md:hidden" aria-label="Open menu">
          <List className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <VisuallyHidden>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Switch between modules</SheetDescription>
        </VisuallyHidden>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b p-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              A
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Activeset Tools</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2">
            {items.map((item) => {
              const active = isNavItemActive(item, pathname);
              const locked = !item.loading && !item.hasAccess;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={locked ? '#' : item.href}
                  onClick={(e) => (locked ? e.preventDefault() : onOpenChange(false))}
                  aria-disabled={locked}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                    active ? 'bg-accent text-primary' : 'hover:bg-accent',
                    locked && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {locked ? <Lock className="size-4" /> : <Icon className="size-4" weight={active ? 'fill' : 'regular'} />}
                  <span className="flex-1 font-medium">{item.label}</span>
                  {locked && <span className="text-xs text-muted-foreground">No access</span>}
                </Link>
              );
            })}
          </nav>
          <div className="border-t p-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                logout();
                onOpenChange(false);
              }}
            >
              <SignOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
