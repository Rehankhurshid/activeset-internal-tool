import type { SignOffChannel, StageApproval } from '@/types';
import { isoDayOrUndefined } from './waiting-on-client';

/**
 * The sign-off log (ACT-91): every time the client said yes, and when.
 *
 * Built on `delivery.approvals`, the record the portal's Approve button already
 * writes. The team adds the ones given elsewhere ("homepage design signed off
 * in Slack on 27 Oct, picked the green variant"), so the record stops living
 * only in a chat thread.
 */

export const SIGN_OFF_CHANNELS: SignOffChannel[] = ['slack', 'email', 'call', 'other'];

export const SIGN_OFF_CHANNEL_LABELS: Record<SignOffChannel, string> = {
  slack: 'Slack',
  email: 'Email',
  call: 'On a call',
  other: 'Elsewhere',
};

/** "in Slack", "by email", "on a call": how the client's page says where. */
export const SIGN_OFF_CHANNEL_PHRASES: Record<SignOffChannel, string> = {
  slack: 'in Slack',
  email: 'by email',
  call: 'on a call',
  other: 'outside this page',
};

const MAX_TITLE = 200;
const MAX_NOTE = 2000;

function isChannel(value: unknown): value is SignOffChannel {
  return typeof value === 'string' && (SIGN_OFF_CHANNELS as string[]).includes(value);
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  return /^https?:\/\/\S+$/i.test(url) ? url : undefined;
}

/** Well-formed records only, oldest first: the order things were agreed in. */
export function signOffLog(approvals: readonly StageApproval[] | undefined): StageApproval[] {
  return (approvals ?? [])
    .filter(
      (a) =>
        a &&
        typeof a.stageKey === 'string' &&
        typeof a.stageTitle === 'string' &&
        typeof a.approvedAt === 'string' &&
        !Number.isNaN(Date.parse(a.approvedAt)),
    )
    .map((a, order) => ({ a, order }))
    .sort((x, y) => x.a.approvedAt.localeCompare(y.a.approvedAt) || x.order - y.order)
    .map(({ a }) => a);
}

/** Whether the team recorded it, rather than the client pressing Approve. */
export function recordedByTeam(approval: StageApproval): boolean {
  return !!approval.recordedBy || approval.stageKey.startsWith('team:');
}

export interface TeamSignOffInput {
  /** What was approved: "Homepage design". */
  title: string;
  /** YYYY-MM-DD the client gave it. */
  date: string;
  note?: string;
  via?: string;
  sourceUrl?: string;
  /** A `client_review` stage this answers, so the portal stops asking for it. */
  stageKey?: string;
  recordedBy: string;
}

/**
 * A sign-off the team records from outside the portal, validated. Throws on a
 * missing title or a date that is not YYYY-MM-DD. The day is stored at noon
 * UTC so it reads as the same day in every timezone the team works in.
 */
export function teamSignOff(input: TeamSignOffInput, makeId: () => string): StageApproval {
  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error('Say what was signed off');
  const day = isoDayOrUndefined(input.date);
  if (!day) throw new Error('Pick the day it was signed off');
  const note = input.note?.trim().slice(0, MAX_NOTE);
  const sourceUrl = httpUrl(input.sourceUrl);
  const stageKey = input.stageKey?.trim() || `team:${makeId()}`;
  const by = input.recordedBy.trim().toLowerCase();
  return {
    stageKey,
    stageTitle: title,
    approvedAt: `${day}T12:00:00.000Z`,
    ...(note ? { note } : {}),
    ...(isChannel(input.via) ? { via: input.via } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(by ? { recordedBy: by } : {}),
  };
}

/** The log with one more entry. A stage already signed off keeps its first record, as the approve route does. */
export function withSignOff(existing: readonly StageApproval[], next: StageApproval): StageApproval[] {
  const clean = existing.filter((a) => a && typeof a.stageKey === 'string');
  return clean.some((a) => a.stageKey === next.stageKey) ? clean : [...clean, next];
}

export function withoutSignOff(existing: readonly StageApproval[], stageKey: string): StageApproval[] {
  return existing.filter((a) => a && typeof a.stageKey === 'string' && a.stageKey !== stageKey);
}

/**
 * Where the project goes after what has been signed off: the stage under way
 * now and the one after it, from the same stages the client's page shows.
 * Nothing when there are no stages; `done` when every one is finished.
 */
export function phaseAfterSignOffs(
  stages: readonly { title: string; state: 'done' | 'current' | 'upcoming' }[],
  currentIndex?: number,
): { now?: string; next?: string; done?: boolean } {
  if (stages.length === 0) return {};
  if (stages.every((s) => s.state === 'done')) return { done: true };
  const index =
    currentIndex !== undefined && currentIndex >= 0 && currentIndex < stages.length
      ? currentIndex
      : stages.findIndex((s) => s.state !== 'done');
  const at = stages[index];
  const now = at && at.state === 'current' ? at.title : undefined;
  const after = stages.slice(now ? index + 1 : index).find((s) => s.state === 'upcoming');
  return { ...(now ? { now } : {}), ...(after ? { next: after.title } : {}) };
}
