import type {
  ClientPlanStage,
  ClientStatus,
  ClientTimelineSettings,
  Project,
  ProjectTimeline,
  TimelineItemStatus,
  TimelineMilestone,
} from '@/types';
import {
  PLAN_COMPLETE,
  isIsoDay,
  normalizePlanFiles,
  type PlanStageState,
  type ResolvedPlan,
  type ResolvedStage,
} from './client-plan';

/**
 * The Timeline tab, as the client's page.
 *
 * Every phase of the project's timeline is a stage the client moves through,
 * and its milestones are the steps inside it. Rehan's call, 2026-09-28: the
 * timeline is where each project's real process lives (six live projects had
 * one, none had a client plan), so when a project has one, the client sees it.
 * Projects without a timeline keep the checklist-drafted plan.
 *
 * Pure: no Firestore, so the projection, the Client tab and the tests share it.
 */

/** A milestone as the client sees it: its title, where it stands and its dates. */
export interface TimelineStep {
  id: string;
  title: string;
  state: PlanStageState;
  startDate?: string;
  endDate?: string;
}

/** One phase with the milestones the client sees in it. */
export interface TimelineStageSource {
  stage: ClientPlanStage;
  steps: TimelineStep[];
}

const UNPHASED_ID = '__unphased__';

/**
 * A milestone's state for the client. Blocked reads as in progress: whether a
 * step is waiting on a supplier or on us is the status note's job, not a red
 * badge on one row.
 */
export function stepState(status: TimelineItemStatus | undefined): PlanStageState {
  if (status === 'completed') return 'done';
  if (status === 'in_progress' || status === 'blocked') return 'current';
  return 'upcoming';
}

/** The milestones the client may see: all of them, less the ones the team held back. */
export function visibleMilestones(
  timeline: Pick<ProjectTimeline, 'milestones'> | null | undefined,
  settings: ClientTimelineSettings | undefined,
): TimelineMilestone[] {
  const hidden = new Set(settings?.hiddenMilestoneIds ?? []);
  return (timeline?.milestones ?? []).filter((m) => m && typeof m.title === 'string' && !hidden.has(m.id));
}

function byDateThenOrder(a: TimelineMilestone, b: TimelineMilestone): number {
  return (a.startDate ?? '').localeCompare(b.startDate ?? '') || (a.order ?? 0) - (b.order ?? 0);
}

/**
 * The timeline's phases as stages, in the timeline's order, each with its
 * visible milestones. A phase with nothing visible in it is left out, and
 * milestones in no phase gather in a last "Other milestones" stage.
 */
export function timelineStages(
  timeline: Pick<ProjectTimeline, 'phases' | 'milestones'> | null | undefined,
  settings: ClientTimelineSettings | undefined,
): TimelineStageSource[] {
  if (!timeline) return [];
  const milestones = visibleMilestones(timeline, settings);
  const phases = [...(timeline.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const phaseIds = new Set(phases.map((p) => p.id));
  const files = settings?.phaseFiles ?? {};

  const groups: { id: string; title: string; milestones: TimelineMilestone[] }[] = phases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    milestones: milestones.filter((m) => m.phaseId === phase.id),
  }));
  const loose = milestones.filter((m) => !m.phaseId || !phaseIds.has(m.phaseId));
  if (loose.length > 0) groups.push({ id: UNPHASED_ID, title: 'Other milestones', milestones: loose });

  return groups
    .filter((group) => group.milestones.length > 0)
    .map((group) => {
      const sorted = [...group.milestones].sort(byDateThenOrder);
      const starts = sorted.map((m) => m.startDate).filter(isIsoDay).sort();
      const ends = sorted.map((m) => m.endDate || m.startDate).filter(isIsoDay).sort();
      const stage: ClientPlanStage = {
        id: group.id,
        title: group.title,
        deliverables: [],
        files: normalizePlanFiles(files[group.id]),
      };
      if (starts.length) stage.startDate = starts[0];
      if (ends.length) stage.dueDate = ends[ends.length - 1];
      return {
        stage,
        steps: sorted.map((m) => {
          const step: TimelineStep = { id: m.id, title: m.title.trim(), state: stepState(m.status) };
          if (isIsoDay(m.startDate)) step.startDate = m.startDate;
          if (isIsoDay(m.endDate)) step.endDate = m.endDate;
          return step;
        }),
      };
    });
}

/** Whether the timeline has anything to show, which is what makes it drive the page. */
export function timelineDrivesPortal(
  timeline: Pick<ProjectTimeline, 'phases' | 'milestones'> | null | undefined,
  settings: ClientTimelineSettings | undefined,
): boolean {
  return timelineStages(timeline, settings).length > 0;
}

export interface ResolveTimelineOptions {
  /** `clientFacing.currentStageId`: a phase id, or {@link PLAN_COMPLETE}. */
  currentStageId?: string;
  status?: ClientStatus;
}

/**
 * Every phase's state and progress, and which phase the project is in: the
 * earliest one with a milestone not yet done, as the Delivery tab picks a
 * stage. Delivered and the team's pin win, as they do for a plan.
 */
export function resolveTimelinePlan(
  sources: TimelineStageSource[],
  options: ResolveTimelineOptions = {},
): ResolvedPlan {
  const tracking = sources.map(({ steps }) => {
    const done = steps.filter((s) => s.state === 'done').length;
    return { done, total: steps.length, open: steps.length - done };
  });

  let currentIndex: number;
  let source: ResolvedPlan['source'];
  const pinned = options.currentStageId;
  if (options.status === 'delivered') {
    currentIndex = -1;
    source = 'delivered';
  } else if (pinned === PLAN_COMPLETE) {
    currentIndex = -1;
    source = 'team';
  } else if (pinned && sources.some((s) => s.stage.id === pinned)) {
    currentIndex = sources.findIndex((s) => s.stage.id === pinned);
    source = 'team';
  } else {
    currentIndex = tracking.findIndex((t) => t.open > 0);
    source = 'checklist';
  }

  return {
    currentIndex,
    source,
    stages: sources.map(({ stage }, index) => {
      const t = tracking[index];
      const state: PlanStageState =
        currentIndex < 0 || index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
      const resolved: ResolvedStage = { stage, state, tracking: t };
      if (t.total > 0) resolved.percent = Math.floor((t.done / t.total) * 100);
      return resolved;
    }),
  };
}

// --- Which stage a call belongs to -------------------------------------------

/**
 * The stage a call on `iso` belongs to: the one whose dates it falls in (the
 * earliest, where phases overlap), else the last one that had started by then,
 * else the first. A kickoff call a day before Discovery's first milestone still
 * lands in Discovery rather than nowhere.
 */
export function stageForDate(
  stages: Pick<ClientPlanStage, 'id' | 'startDate' | 'dueDate'>[],
  iso: string | undefined,
): string | undefined {
  if (stages.length === 0) return undefined;
  const day = typeof iso === 'string' ? iso.slice(0, 10) : '';
  if (!isIsoDay(day)) return stages[0].id;
  const within = stages.find((s) => s.startDate && s.dueDate && s.startDate <= day && day <= s.dueDate);
  if (within) return within.id;
  let started: string | undefined;
  for (const s of stages) if (s.startDate && s.startDate <= day) started = s.id;
  return started ?? stages[0].id;
}

// --- Whose calls are these ---------------------------------------------------

/** Mailbox providers: a gmail.com address says nothing about which client it is. */
const SHARED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'activeset.co',
]);

/** Hosts that belong to a platform, not to the client: never an email domain. */
const PLATFORM_HOST = /\.(webflow\.io|framer\.website|framer\.app|vercel\.app|netlify\.app|pages\.dev|wixsite\.com|squarespace\.com)$/i;

/** "https://www.AssetPlus.io/" or "@assetplus.io" → "assetplus.io"; null for anything unusable. */
export function normalizeMeetingDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z]+:\/\//, '').replace(/^.*@/, '').split(/[/?#:]/)[0].replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return null;
  if (SHARED_EMAIL_DOMAINS.has(value) || PLATFORM_HOST.test(`.${value}`)) return null;
  return value;
}

/**
 * The email domains whose calls belong to this project: the ones the team set,
 * else the client contacts' domains and the site's own domain.
 */
export function meetingDomainsFor(
  project: Pick<Project, 'clientTimeline' | 'clientPortal' | 'webflowConfig'>,
): string[] {
  const set = project.clientTimeline?.meetingDomains ?? [];
  const chosen = set.map(normalizeMeetingDomain).filter((d): d is string => d !== null);
  if (chosen.length > 0) return [...new Set(chosen)];
  const derived = [
    ...(project.clientPortal?.contactEmails ?? []),
    project.webflowConfig?.customDomain,
  ]
    .map(normalizeMeetingDomain)
    .filter((d): d is string => d !== null);
  return [...new Set(derived)];
}

// --- Stored settings --------------------------------------------------------

/**
 * Timeline settings as they may be stored: web links only, no empty lists
 * kept, bounded sizes. Run on every write, like `normalizeClientPlan`.
 */
export function normalizeClientTimelineSettings(raw: ClientTimelineSettings | null | undefined): ClientTimelineSettings {
  const out: ClientTimelineSettings = {};
  const phaseFiles: Record<string, ReturnType<typeof normalizePlanFiles>> = {};
  for (const [phaseId, files] of Object.entries(raw?.phaseFiles ?? {}).slice(0, 60)) {
    const clean = normalizePlanFiles(files);
    if (clean.length && phaseId && phaseId.length <= 120) phaseFiles[phaseId] = clean;
  }
  if (Object.keys(phaseFiles).length) out.phaseFiles = phaseFiles;
  const files = normalizePlanFiles(raw?.files);
  if (files.length) out.files = files;
  const hidden = [...new Set((raw?.hiddenMilestoneIds ?? []).filter((id) => typeof id === 'string' && id))].slice(0, 500);
  if (hidden.length) out.hiddenMilestoneIds = hidden;
  const domains = [
    ...new Set((raw?.meetingDomains ?? []).map(normalizeMeetingDomain).filter((d): d is string => d !== null)),
  ].slice(0, 10);
  if (domains.length) out.meetingDomains = domains;
  return out;
}
