import type { Project } from '@/types';

export type ReviewStatus = 'today' | 'recent' | 'stale' | 'overdue' | 'never';

/**
 * YYYY-MM-DD in a named timezone. When no zone is passed we fall back to the
 * runtime's local timezone — the browser's TZ on the client, the server's TZ
 * on the server. Crons should pass an explicit zone (e.g. `America/New_York`)
 * so the boundary doesn't shift with the build environment.
 */
export function todayIso(now: Date = new Date(), timeZone?: string): string {
  if (!timeZone) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // en-CA already formats as YYYY-MM-DD, but formatToParts gives us a guarantee
  // it stays that way regardless of locale data quirks.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Days between two YYYY-MM-DD strings (positive when `b` is later). */
export function daysBetweenIso(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Number of full days since the project was last reviewed, or null if never. */
export function daysSinceReview(project: Pick<Project, 'lastReviewDate'>, today: string = todayIso()): number | null {
  if (!project.lastReviewDate) return null;
  return daysBetweenIso(project.lastReviewDate, today);
}

/**
 * Status bucket for the indicator dot.
 * - today    → reviewed today (green)
 * - recent   → reviewed yesterday (amber)
 * - stale    → 2 days ago (amber, slightly louder)
 * - overdue  → 3+ days ago (red)
 * - never    → never reviewed (red, distinct copy)
 */
export function getReviewStatus(
  project: Pick<Project, 'lastReviewDate'>,
  today: string = todayIso(),
): ReviewStatus {
  const days = daysSinceReview(project, today);
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'recent';
  if (days === 2) return 'stale';
  return 'overdue';
}

export function isReviewedToday(
  project: Pick<Project, 'lastReviewDate'>,
  today: string = todayIso(),
): boolean {
  return project.lastReviewDate === today;
}

/**
 * Compute the next streak value when marking a project reviewed today.
 * - If they already reviewed today → no change.
 * - If yesterday's review → streak + 1.
 * - Otherwise → reset to 1 (today is the start of a new streak).
 */
export function nextStreak(
  project: Pick<Project, 'lastReviewDate' | 'reviewStreak'>,
  today: string = todayIso(),
): number {
  const days = daysSinceReview(project, today);
  if (days === 0) return project.reviewStreak ?? 1;
  if (days === 1) return (project.reviewStreak ?? 0) + 1;
  return 1;
}
