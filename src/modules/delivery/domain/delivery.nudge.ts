import type { ProjectStatus } from '@/types';

/**
 * Who still owes something on a live project, and who to stop chasing.
 *
 * A nudge that keeps arriving after the work is finished is worse than no nudge
 * at all: people learn the sender is wrong and stop reading it, and then the one
 * that mattered gets skimmed past too. So the stopping rules are the important
 * part here, not the sending.
 *
 * Pure on purpose — deciding who to chase is the bit worth testing, and it
 * should not need a mailbox or a Firestore connection to check.
 */

/** One outstanding thing, wherever it came from. */
export interface NudgeItem {
  title: string;
  /** Delivery steps and tasks are opened in different places, so they are named apart. */
  source: 'step' | 'task';
  /** The stage or the project area it sits in, for grouping in the mail. */
  stage?: string;
  dueDate?: string;
  /** Positive is days late, 0 is today, negative is days left, undefined is undated. */
  daysOverdue?: number;
  url?: string;
}

export interface NudgeProject {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  /** Every stage of the delivery arc is finished. */
  arcComplete: boolean;
  /** Outstanding items, already filtered to team members. */
  items: { assignee: string; item: NudgeItem }[];
}

export type SkipReason = 'closed' | 'paid' | 'paused' | 'arc-complete' | 'nothing-outstanding';

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  closed: 'the project is closed',
  paid: 'the project is closed and paid',
  paused: 'the project is paused',
  'arc-complete': 'every stage is finished',
  'nothing-outstanding': 'nothing is assigned and unfinished',
};

/**
 * Whether a project should be chased at all today.
 *
 * Four ways to stop, and all four are checked rather than one standing in for
 * the others: a status somebody forgot to flip should not keep a finished
 * project nagging, and a finished arc on a project that is merely paused should
 * not either. Each returns why, so the digest can say what it skipped instead of
 * quietly doing nothing.
 */
export function skipReasonFor(project: NudgeProject): SkipReason | null {
  if (project.status === 'closed') return 'closed';
  if (project.status === 'paid') return 'paid';
  if (project.status === 'paused') return 'paused';
  if (project.arcComplete) return 'arc-complete';
  if (project.items.length === 0) return 'nothing-outstanding';
  return null;
}

/** One person's outstanding work on one project. */
export interface PersonProject {
  projectId: string;
  projectName: string;
  items: NudgeItem[];
  /** The worst lateness on this project, for ordering. */
  worstOverdue: number;
}

export interface PersonNudge {
  assignee: string;
  projects: PersonProject[];
  total: number;
  overdue: number;
  /** Nothing late, so the mail can open differently rather than sounding alarmed. */
  allOnTime: boolean;
}

const UNDATED = -1000;

function worstOf(items: NudgeItem[]): number {
  return items.reduce((worst, item) => Math.max(worst, item.daysOverdue ?? UNDATED), UNDATED);
}

/**
 * The day's chasing, one bundle per person.
 *
 * Per person rather than per project, because one mail listing everything
 * somebody owes is answerable in a sitting and four mails are not. Projects are
 * ordered by how late they are so the top of the mail is the part that matters.
 *
 * Only people with something outstanding appear at all, which is the rule Rehan
 * asked for: chase somebody while their part remains, and stop the moment it
 * does not.
 */
export function nudgesByPerson(projects: NudgeProject[]): PersonNudge[] {
  const byPerson = new Map<string, Map<string, PersonProject>>();

  for (const project of projects) {
    if (skipReasonFor(project)) continue;

    for (const { assignee, item } of project.items) {
      const key = assignee.toLowerCase().trim();
      if (!key) continue;

      const forPerson = byPerson.get(key) ?? new Map<string, PersonProject>();
      const entry = forPerson.get(project.projectId) ?? {
        projectId: project.projectId,
        projectName: project.projectName,
        items: [],
        worstOverdue: UNDATED,
      };
      entry.items.push(item);
      forPerson.set(project.projectId, entry);
      byPerson.set(key, forPerson);
    }
  }

  const out: PersonNudge[] = [];
  for (const [assignee, projectMap] of byPerson) {
    const projectList = [...projectMap.values()].map((p) => ({
      ...p,
      // Late first within a project too, so the mail reads worst to best
      // throughout rather than only at the project level.
      items: [...p.items].sort((a, b) => (b.daysOverdue ?? UNDATED) - (a.daysOverdue ?? UNDATED)),
      worstOverdue: worstOf(p.items),
    }));
    projectList.sort((a, b) => b.worstOverdue - a.worstOverdue || a.projectName.localeCompare(b.projectName));

    const items = projectList.flatMap((p) => p.items);
    const overdue = items.filter((i) => (i.daysOverdue ?? 0) > 0).length;

    out.push({
      assignee,
      projects: projectList,
      total: items.length,
      overdue,
      allOnTime: overdue === 0,
    });
  }

  out.sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.assignee.localeCompare(b.assignee));
  return out;
}

export interface NudgeDigest {
  people: PersonNudge[];
  /** Projects being chased today. */
  active: { projectId: string; projectName: string; outstanding: number }[];
  /** Projects deliberately left alone, and why. */
  skipped: { projectId: string; projectName: string; reason: SkipReason }[];
  totalItems: number;
  totalOverdue: number;
}

/**
 * The whole board in one place, for the person who wants to see all of it.
 *
 * Carries what was skipped and why, because "no mail today" and "I decided not
 * to chase these six projects" look identical otherwise, and only one of them
 * means the system is working.
 */
export function buildDigest(projects: NudgeProject[]): NudgeDigest {
  const active: NudgeDigest['active'] = [];
  const skipped: NudgeDigest['skipped'] = [];

  for (const project of projects) {
    const reason = skipReasonFor(project);
    if (reason) {
      skipped.push({ projectId: project.projectId, projectName: project.projectName, reason });
    } else {
      active.push({
        projectId: project.projectId,
        projectName: project.projectName,
        outstanding: project.items.length,
      });
    }
  }

  active.sort((a, b) => b.outstanding - a.outstanding || a.projectName.localeCompare(b.projectName));
  skipped.sort((a, b) => a.projectName.localeCompare(b.projectName));

  const people = nudgesByPerson(projects);
  return {
    people,
    active,
    skipped,
    totalItems: people.reduce((n, p) => n + p.total, 0),
    totalOverdue: people.reduce((n, p) => n + p.overdue, 0),
  };
}
