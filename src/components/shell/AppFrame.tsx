'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/modules/auth-access';
import { cn } from '@/lib/utils';
import { AppRail } from './AppRail';
import { HintBar } from './HintBar';

const CommandPalette = dynamic(
  () => import('@/components/CommandPalette').then((m) => m.CommandPalette),
  { ssr: false },
);
const ShortcutHelp = dynamic(
  () => import('@/shared/keyboard').then((m) => m.ShortcutHelp),
  { ssr: false },
);

function isAppRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/' || pathname.startsWith('/modules');
}

/**
 * Wraps every page. Inside the signed-in app (`/` and `/modules/*`) it adds the
 * left rail and bottom hint bar; public routes such as /share, /view, /embed,
 * /portal and the login screen render bare.
 *
 * Command palette and shortcut help load only after sign-in (lazy + gated on
 * `shell`) so the login screen does not pull cmdk, project search, or the
 * shortcut sheet. Portal and other public routes never mount them.
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
      {shell && (
        <>
          <ShortcutHelp />
          <CommandPalette />
        </>
      )}
    </>
  );
}
