export type {
  ClientFacingState,
  ClientPlan,
  ClientPlanFile,
  ClientPlanStage,
  ClientPortalSettings,
  ClientStageKind,
  ClientStatus,
} from '@/types';
import type { ClientStatus } from '@/types';
import type { SheetChangeState, WorkState } from './project-sheet.types';
export type { WorkState } from './project-sheet.types';
export {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_PORTAL_LABELS,
  normalizeClientStatus,
} from '@/types';

/** A file or link on the client's dashboard. */
export interface PortalFileView {
  id: string;
  title: string;
  /** Always http(s). */
  url: string;
}

export type PortalStageState = 'done' | 'current' | 'upcoming';

/** Client wording for a stage's state. */
export const PORTAL_STAGE_LABELS: Record<PortalStageState, string> = {
  done: 'Done',
  current: 'Now',
  upcoming: 'Coming up',
};

/** Whose step a milestone is, when it is not only ours: the client's own, or one we do together. */
export type PortalStepOwner = 'client' | 'both';

/** A Timeline milestone inside a stage: title, where it stands, dates. Nothing else. */
export interface PortalStepView {
  id: string;
  title: string;
  state: PortalStageState;
  /** ISO YYYY-MM-DD */
  startDate?: string;
  /** ISO YYYY-MM-DD */
  endDate?: string;
  /** From the project sheet's Owner column, as a role: never a person's name. */
  owner?: PortalStepOwner;
  /** The step is in the client's hands: their feedback, approval or files are what it waits for. */
  waiting?: boolean;
  /** What to look at for this step (the moodboard, the staging site). Always http(s). */
  url?: string;
  /** One line the team wrote for the client ("Note for client" column). */
  note?: string;
}

/**
 * A call the team chose to share. Names, never email addresses; the summary is
 * Markdown, read by `parseSummary` into plain elements, never injected.
 */
export interface PortalMeetingView {
  id: string;
  title: string;
  /** ISO timestamp the call started. */
  date: string;
  durationMinutes?: number;
  attendees: string[];
  summary?: string;
  nextSteps: { text: string; owner?: string }[];
  /** Fathom's share link. Always http(s). */
  recordingUrl?: string;
}

/** One stage of the plan, as the client sees it. */
export interface PortalStageView {
  id: string;
  title: string;
  state: PortalStageState;
  /** ISO YYYY-MM-DD */
  startDate?: string;
  /** ISO YYYY-MM-DD: when the stage is due to finish. */
  dueDate?: string;
  /** What the client gets in this stage. */
  deliverables: string[];
  files: PortalFileView[];
  /**
   * How far through the stage we are, 0–100. Only on the current stage, and
   * only when the checklist tracks it. The steps behind the number never leave
   * the building; the number does.
   */
  percent?: number;
  /** The stage's milestones, in order. Only when the Timeline drives the page. */
  steps?: PortalStepView[];
  /** Calls held in this stage that the team shared, newest first. */
  meetings?: PortalMeetingView[];
}

/**
 * "What we need from you" row. From a task: title and due date only, never its
 * description. From the project sheet's Client Inputs tab, also the columns
 * that tab writes for the client: why it matters, the section, their own owner,
 * where it goes.
 */
export interface PortalAskView {
  id: string;
  title: string;
  /** ISO YYYY-MM-DD */
  dueDate?: string;
  /** A due date the sheet gives in words ("Day 1"). */
  dueText?: string;
  why?: string;
  group?: string;
  /** The client's own person for it. */
  owner?: string;
  /** Where to put it, or the sheet tab to fill. Always http(s). */
  url?: string;
  /** `fill`: a `[Fill this]` tab of the project sheet. */
  kind?: 'input' | 'decision' | 'fill';
  /** How much of a `[Fill this]` tab is filled. */
  progress?: { done: number; total: number };
}

/** One row of a tracker tab: a page, a deliverable, an animation, a task. */
export interface PortalWorkItemView {
  id: string;
  title: string;
  group?: string;
  /** The stage this row belongs to, when the sheet ties it to a Timeline phase. */
  stageId?: string;
  /** Where the row stands across all its tracks. */
  state: WorkState;
  /** One per track, in the workstream's order. */
  states: WorkState[];
  /** ISO YYYY-MM-DD */
  targetDate?: string;
  targetText?: string;
  /** Staging, design and document links on the row. */
  links: PortalFileView[];
}

/** A tracker tab, as the client sees it. Assignees and notes are never read from the sheet. */
export interface PortalWorkstreamView {
  id: string;
  title: string;
  /** Column labels: "Copy", "Design", "Dev: Desktop"... */
  tracks: string[];
  items: PortalWorkItemView[];
}

/** A change outside the signed scope: what it is, what it costs, and whether it is agreed. */
export interface PortalChangeView {
  id: string;
  ref?: string;
  title: string;
  state: SheetChangeState;
  /** ISO YYYY-MM-DD */
  raisedDate?: string;
  affects?: string;
  estimate?: string;
  days?: string;
}

export interface PortalCheckGroupView {
  title: string;
  done: number;
  total: number;
  checks: { title: string; done: boolean }[];
}

/** How ready for launch the project is: the launch checklist, SEO tags, redirects. */
export interface PortalReadinessView {
  id: string;
  title: string;
  done: number;
  total: number;
  groups?: PortalCheckGroupView[];
}

/** The project's headline facts, from the sheet's Overview tab. */
export interface PortalFactsView {
  engagement?: string;
  /** ISO YYYY-MM-DD */
  kickoffDate?: string;
  /** ISO YYYY-MM-DD */
  targetLaunchDate?: string;
  targetLaunchText?: string;
}


export type PortalPlanSource = 'sheet' | 'checklist' | 'timeline' | 'plan';

/** Steps in order, with who does each and when: the sheet's Process, or the checklist's. */
export function showsProcess(source: PortalPlanSource | undefined): boolean {
  return source === 'sheet' || source === 'checklist';
}

/**
 * The ONLY payload the client portal page receives. Built by
 * `buildClientPortalView`; every field is an explicit allow-list decision.
 * Adding a field here is a product decision, not a convenience.
 */
export interface ClientPortalView {
  projectId: string;
  projectName: string;
  /** Client company name shown in the header. */
  brandName: string;
  brandLogoUrl?: string;
  welcome?: string;
  /** The agency contact shown in the footer (an @activeset.co address). */
  agencyContactEmail?: string;
  /** Live site, when known. Public by nature. */
  websiteUrl?: string;
  status: ClientStatus;
  /** Portal wording for `status`. */
  statusLabel: string;
  statusNote?: string;
  /**
   * ISO timestamp of the latest thing that moved the dashboard: the team's
   * status note, a plan edit, or a tick on the checklist behind the tracker.
   */
  lastUpdateAt?: string;
  /**
   * Where the stages come from: the project sheet's Process tab, the checklist
   * (its steps labelled for the client), the app's Timeline tab (phases with
   * milestones), or the plan drafted from the checklist. Decides the page's
   * wording, and whether it shows the numbered process.
   */
  planSource: PortalPlanSource;
  /** Headline facts from the project sheet's Overview. */
  facts?: PortalFactsView;
  /** The plan, in order. Empty until the team has one. */
  stages: PortalStageView[];
  /** Index into `stages`. Absent when every stage is done, or there are none. */
  currentStageIndex?: number;
  /** Files for the whole project rather than one stage. */
  files: PortalFileView[];
  asks: PortalAskView[];
  /** Client inputs already received, counted rather than listed. */
  asksReceived?: number;
  /** The project sheet's trackers. */
  work?: PortalWorkstreamView[];
  /** Change requests from the sheet's Change Log. */
  changes?: PortalChangeView[];
  /** Launch checklist, SEO tags and redirects, as counts. */
  readiness?: PortalReadinessView[];
  /** The project sheet, when the team chose to link the client to it. */
  sheetUrl?: string;
  /**
   * The stage waiting on the client's approval, when there is one.
   *
   * Deliberately carries no item titles. The stage's steps are ours — "fix the
   * markup comments", "record the walkthrough videos" — and the client has the
   * deliverables and the status note to judge by. What they need here is one
   * thing to say yes to.
   */
  review?: PortalReviewView;
  /** ISO timestamp the projection was built (server time). */
  generatedAt: string;
}

export interface PortalReviewView {
  /** Echoed back by the approve route, which checks it names a real review stage. */
  stageKey: string;
  title: string;
  /** Set once approved, which is also what stops the card asking again. */
  approvedAt?: string;
  approvedNote?: string;
}

/** Keys of ClientPortalView, kept in step by the projection test. */
export const CLIENT_PORTAL_VIEW_KEYS = [
  'projectId',
  'projectName',
  'brandName',
  'brandLogoUrl',
  'welcome',
  'agencyContactEmail',
  'websiteUrl',
  'status',
  'statusLabel',
  'statusNote',
  'lastUpdateAt',
  'planSource',
  'facts',
  'stages',
  'currentStageIndex',
  'files',
  'asks',
  'asksReceived',
  'work',
  'changes',
  'readiness',
  'sheetUrl',
  'review',
  'generatedAt',
] as const;
