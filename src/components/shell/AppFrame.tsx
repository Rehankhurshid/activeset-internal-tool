'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/auth-access';
import { CommandPalette } from '@/components/CommandPalette';
import { ShortcutHelp } from '@/shared/keyboard';
import { cn } from '@/lib/utils';
import { AppRail } from './AppRail';
import { HintBar } from './HintBar';

function isAppRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/' || pathname.startsWith('/modules');
}

/**
 * Wraps every page. Inside the signed-in app (`/` and `/modules/*`) it adds the
 * left rail and bottom hint bar; public routes such as /share, /view, /embed
 * and the login screen render bare.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const shell = isAppRoute(pathname) && !!user;

  return (
    <>
      {shell && <AppRail />}
      <div className={cn(shell && 'md:pl-[var(--shell-rail)] md:pb-[var(--shell-hintbar)]')}>{children}</div>
      {shell && <HintBar />}
      <ShortcutHelp />
      <CommandPalette />
    </>
  );
}
