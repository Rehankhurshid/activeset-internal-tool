import type { ClientStatus } from '@/types';

export type {
  ClientFacingState,
  ClientPortalSettings,
  ClientStatus,
} from '@/types';
export {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_PORTAL_LABELS,
  normalizeClientStatus,
} from '@/types';

/** Milestone wording on the portal: never "Not Started" / "Blocked". */
export type PortalMilestoneStatus = 'upcoming' | 'in_progress' | 'done' | 'on_hold';

export const PORTAL_MILESTONE_LABELS: Record<PortalMilestoneStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  done: 'Done',
  on_hold: 'On hold',
};

export interface PortalMilestoneView {
  id: string;
  title: string;
  status: PortalMilestoneStatus;
  /** ISO YYYY-MM-DD */
  startDate: string;
  /** ISO YYYY-MM-DD (inclusive) */
  endDate: string;
}

export interface PortalPhaseView {
  id: string;
  title: string;
  order: number;
  isCurrent: boolean;
  /** Only milestones flagged `clientVisible`. May be empty. */
  milestones: PortalMilestoneView[];
  /** Synthetic "Other" group for visible milestones with no (or a deleted)
   *  phase. Never part of the stepper or the phase count. */
  ungrouped?: boolean;
}

export interface PortalDeliverableView {
  id: string;
  title: string;
  url: string;
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
  currentPhase?: { id: string; title: string; index: number; total: number };
  nextMilestone?: PortalMilestoneView;
  progress: { done: number; total: number };
  /** ISO timestamp of the team's last "Mark updated" / status edit. */
  lastUpdateAt?: string;
  phases: PortalPhaseView[];
  deliverables: PortalDeliverableView[];
  asks: PortalAskView[];
  /** ISO timestamp the projection was built (server time). */
  generatedAt: string;
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
  'currentPhase',
  'nextMilestone',
  'progress',
  'lastUpdateAt',
  'phases',
  'deliverables',
  'asks',
  'generatedAt',
] as const;
