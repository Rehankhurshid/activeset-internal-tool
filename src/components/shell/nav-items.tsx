'use client';

import type { Icon } from '@phosphor-icons/react';
import { Camera, FileText, FolderSimple, House, ListChecks, Wrench } from '@phosphor-icons/react';
import { useAuth, useModuleAccess } from '@/modules/auth-access';

export type NavAccess = 'proposal' | 'project-links';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  /** Chord after `g`, e.g. `'p'` → `g p`. */
  keys: string;
  icon: Icon;
  access?: NavAccess;
  /** Hide entirely (rather than lock) when the viewer lacks access. */
  hideWithoutAccess?: boolean;
  exact?: boolean;
}

export interface ResolvedNavItem extends NavItem {
  hasAccess: boolean;
  loading: boolean;
}

/** Single source of truth for the rail, the mobile sheet, the palette and the home list. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', description: 'Alerts, daily health and every module.', keys: 'g h', icon: House, exact: true },
  { href: '/modules/project-links', label: 'Client Projects', description: 'Every client project, audit and link in one place.', keys: 'g p', icon: FolderSimple, access: 'project-links' },
  { href: '/modules/proposal', label: 'Proposals', description: 'Write and send website proposals with Gemini.', keys: 'g o', icon: FileText, access: 'proposal', hideWithoutAccess: true },
  { href: '/modules/screenshot-runner', label: 'Screenshot Runner', description: 'Full-page captures for a list of URLs.', keys: 'g s', icon: Camera, access: 'project-links' },
  { href: '/modules/internal-tools', label: 'Internal Tools', description: 'Chrome extensions and setup instructions.', keys: 'g t', icon: Wrench },
  { href: '/modules/checklist-creator', label: 'Checklist Creator', description: 'SOP templates, generated or hand-built.', keys: 'g c', icon: ListChecks },
];

export function isNavItemActive(item: Pick<NavItem, 'href' | 'exact'>, pathname: string | null): boolean {
  if (!pathname) return false;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** NAV_ITEMS with the viewer's module grants resolved. */
export function useNavItems(): ResolvedNavItem[] {
  const { isAdmin } = useAuth();
  const proposal = useModuleAccess('proposal');
  const projectLinks = useModuleAccess('project-links');

  return NAV_ITEMS.map((item) => {
    const grant =
      item.access === 'proposal' ? proposal : item.access === 'project-links' ? projectLinks : null;
    return {
      ...item,
      hasAccess: grant ? grant.hasAccess || isAdmin : true,
      loading: grant?.loading ?? false,
    };
  }).filter((item) => !(item.hideWithoutAccess && !item.loading && !item.hasAccess));
}
