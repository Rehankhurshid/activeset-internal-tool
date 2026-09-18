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
 * left rail and bottom hint bar; public routes such as /share, /view, /embed,
 * /portal and the login screen render bare.
 *
 * The keyboard layer is mounted only on app routes. The command palette already
 * guards its own bindings on a signed-in user, but the shortcut-help sheet does
 * not: without this, a client on their portal page who typed `?` would be shown
 * the internal app's shortcut sheet.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const inApp = isAppRoute(pathname);
  const shell = inApp && !!user;

  return (
    <>
      {shell && <AppRail />}
      <div className={cn(shell && 'md:pl-[var(--shell-rail)] md:pb-[var(--shell-hintbar)]')}>{children}</div>
      {shell && <HintBar />}
      {inApp && (
        <>
          <ShortcutHelp />
          <CommandPalette />
        </>
      )}
    </>
  );
}
