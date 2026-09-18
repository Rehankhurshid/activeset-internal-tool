import type { ClientFacingState, ClientStatus } from '@/types';
import { daysBetweenIso, todayIso } from '@/lib/review-status';

/** Portals with no team update for this many days count as stale. */
export const PORTAL_STALE_AFTER_DAYS = 7;

/** Sort order for dashboards: what needs attention first. */
export const CLIENT_STATUS_ORDER: ClientStatus[] = ['needs_client', 'blocked', 'on_track', 'paused', 'delivered'];

/** Whole days since the team last marked the portal updated, or null if never. */
export function daysSinceClientUpdate(
  facing: Pick<ClientFacingState, 'lastUpdateAt'> | undefined,
  today: string = todayIso(),
): number | null {
  const at = facing?.lastUpdateAt;
  if (!at) return null;
  const day = at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return daysBetweenIso(day, today);
}

/** True when the portal is enabled and the last update is older than the threshold (or never). */
export function isPortalStale(
  project: { clientPortal?: { enabled?: boolean }; clientFacing?: Pick<ClientFacingState, 'lastUpdateAt'> },
  today: string = todayIso(),
  staleAfterDays: number = PORTAL_STALE_AFTER_DAYS,
): boolean {
  if (project.clientPortal?.enabled !== true) return false;
  const days = daysSinceClientUpdate(project.clientFacing, today);
  return days === null || days > staleAfterDays;
}

/** Short relative label for chips: "today", "3d", "2w". */
export function ageLabel(days: number | null): string {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}
