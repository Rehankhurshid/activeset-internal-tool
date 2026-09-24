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
}

/** "What we need from you" row. Title and due date only — never descriptions. */
export interface PortalAskView {
  id: string;
  title: string;
  dueDate?: string;
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
  /** The plan, in order. Empty until the team has one. */
  stages: PortalStageView[];
  /** Index into `stages`. Absent when every stage is done, or there are none. */
  currentStageIndex?: number;
  /** Files for the whole project rather than one stage. */
  files: PortalFileView[];
  asks: PortalAskView[];
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
  'stages',
  'currentStageIndex',
  'files',
  'asks',
  'review',
  'generatedAt',
] as const;
