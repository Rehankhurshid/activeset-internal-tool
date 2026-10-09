import type { ChecklistSection, Project } from '@/types';
import type { ProjectPage } from './delivery.types';
import { SETTLED_PAGE_STATUSES } from './delivery.types';

/** Page-tracker columns that count as dev work on the Webflow stack. */
export const DEV_DISCIPLINE_IDS = ['dev_desktop', 'dev_mobile'] as const;

export const DEV_NUDGE_INTERVAL_DAYS = 2;

export function resolveDevOwnerEmail(
  project: Pick<Project, 'delivery' | 'assigneeEmails'>,
  pages: ProjectPage[],
  sections: ChecklistSection[],
): string | null {
  const pinned = project.delivery?.devOwnerEmail?.toLowerCase().trim();
  if (pinned) return pinned;

  const counts = new Map<string, number>();
  for (const page of pages) {
    const email = page.assignee?.toLowerCase().trim();
    if (!email) continue;
    const devOpen = DEV_DISCIPLINE_IDS.some((id) => {
      const status = page.work?.[id];
      return status && !SETTLED_PAGE_STATUSES.has(status);
    });
    if (devOpen) counts.set(email, (counts.get(email) ?? 0) + 1);
  }

  for (const section of sections) {
    for (const item of section.items ?? []) {
      if (item.status === 'completed' || item.status === 'skipped') continue;
      const email = item.assignee?.toLowerCase().trim();
      if (!email) continue;
      counts.set(email, (counts.get(email) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [email, n] of counts) {
    if (n > bestCount) {
      best = email;
      bestCount = n;
    }
  }
  if (best) return best;

  const team = project.assigneeEmails?.map((e) => e.toLowerCase().trim()).filter(Boolean) ?? [];
  return team[0] ?? null;
}

export function devWorkOutstanding(pages: ProjectPage[], sections: ChecklistSection[]): boolean {
  for (const page of pages) {
    for (const id of DEV_DISCIPLINE_IDS) {
      const status = page.work?.[id];
      if (status && !SETTLED_PAGE_STATUSES.has(status)) return true;
    }
  }
  for (const section of sections) {
    for (const item of section.items ?? []) {
      if (item.status !== 'completed' && item.status !== 'skipped') return true;
    }
  }
  return false;
}

export function daysSinceIso(iso: string | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

export function shouldSendDevNudge(
  lastDevNudgeAt: string | undefined,
  lastActivityAt: string | undefined,
  now = new Date(),
): boolean {
  const sinceNudge = daysSinceIso(lastDevNudgeAt, now);
  const sinceActivity = daysSinceIso(lastActivityAt, now);
  if (sinceActivity !== null && sinceActivity < DEV_NUDGE_INTERVAL_DAYS) return false;
  if (sinceNudge !== null && sinceNudge < DEV_NUDGE_INTERVAL_DAYS) return false;
  return true;
}
