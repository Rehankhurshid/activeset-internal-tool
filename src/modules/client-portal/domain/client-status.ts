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
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return null;
  // Convert the stored instant to the VIEWER's calendar day before differencing.
  // Slicing the ISO string would compare a UTC day against a local `today`, which
  // reads as a day old within hours of an update anywhere east of UTC.
  return daysBetweenIso(todayIso(parsed), today);
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
