/**
 * Pure formatting helpers for the client portal page.
 *
 * No React and no `Date.now()`: every function takes `now` explicitly (the
 * screen passes the projection's `generatedAt`) so server output is stable
 * and the helpers are trivially testable.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

interface DayParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

/** Parses the leading YYYY-MM-DD of an ISO date or timestamp. */
export function parseIsoDay(value: string | null | undefined): DayParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function utcParts(date: Date): DayParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function dayNumber(parts: DayParts): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function monthName(parts: DayParts): string {
  return MONTHS[parts.month - 1];
}

/** "10 Sep", or "10 Sep 2027" when the year is not the current one. */
export function formatDay(iso: string | null | undefined, now: Date): string {
  const parts = parseIsoDay(iso);
  if (!parts) return '';
  const label = `${parts.day} ${monthName(parts)}`;
  return parts.year === now.getUTCFullYear() ? label : `${label} ${parts.year}`;
}

/**
 * "10–18 Sep", "28 Sep – 2 Oct", or "10 Sep" for a single day. Years are
 * appended only when they differ from the current year; a range that crosses
 * a year boundary spells out both.
 */
export function formatDateRange(startIso: string, endIso: string, now: Date): string {
  const start = parseIsoDay(startIso);
  const end = parseIsoDay(endIso);
  if (!start && !end) return '';
  if (!start || !end) return formatDay(start ? startIso : endIso, now);

  const currentYear = now.getUTCFullYear();
  const yearSuffix = (parts: DayParts) => (parts.year === currentYear ? '' : ` ${parts.year}`);

  if (start.year === end.year && start.month === end.month) {
    if (start.day === end.day) return `${start.day} ${monthName(start)}${yearSuffix(start)}`;
    return `${start.day}–${end.day} ${monthName(start)}${yearSuffix(start)}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${monthName(start)} – ${end.day} ${monthName(end)}${yearSuffix(end)}`;
  }
  return `${start.day} ${monthName(start)} ${start.year} – ${end.day} ${monthName(end)} ${end.year}`;
}

/** A stage's dates: "10–18 Sep", "Due 18 Sep" or "From 10 Sep"; empty when it has none. */
export function formatStageDates(startIso: string | undefined, dueIso: string | undefined, now: Date): string {
  if (startIso && dueIso) return formatDateRange(startIso, dueIso, now);
  if (dueIso) return `Due ${formatDay(dueIso, now)}`;
  if (startIso) return `From ${formatDay(startIso, now)}`;
  return '';
}

/** Whole UTC calendar days from `iso` to `now`; null when `iso` is missing or malformed. */
export function daysAgo(iso: string | null | undefined, now: Date): number | null {
  const parts = parseIsoDay(iso);
  if (!parts) return null;
  return dayNumber(utcParts(now)) - dayNumber(parts);
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "3 months ago"; null when unknown. */
export function formatRelativeDay(iso: string | null | undefined, now: Date): string | null {
  const days = daysAgo(iso, now);
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months <= 1 ? 'a month ago' : `${months} months ago`;
  }
  const years = Math.round(days / 365);
  return years <= 1 ? 'a year ago' : `${years} years ago`;
}

/** "staging.peakxv.com" for display under a link; falls back to the raw string. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0] || url;
  }
}

/** First letter of the brand name for the fallback logo tile. */
export function brandInitial(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : '·';
}
