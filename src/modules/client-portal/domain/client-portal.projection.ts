import type {
  ClientUpdate,
  Project,
  ProjectLink,
  ProjectTimeline,
  Task,
  TimelineItemStatus,
  TimelineMilestone,
} from '@/types';
import { CLIENT_STATUS_PORTAL_LABELS, normalizeClientStatus } from '@/types';
import type {
  ClientPortalView,
  PortalAskView,
  PortalDeliverableView,
  PortalMilestoneStatus,
  PortalMilestoneView,
  PortalPhaseView,
  PortalUpdateView,
} from './client-portal.types';

export interface BuildClientPortalViewInput {
  project: Project;
  timeline: ProjectTimeline | null | undefined;
  /** Optional. Only tasks with `needsClientInput` and not done become asks. */
  tasks?: Task[];
  /** Team posts, newest first after projection. */
  updates?: ClientUpdate[];
  now?: Date;
}

const MILESTONE_STATUS: Record<TimelineItemStatus, PortalMilestoneStatus> = {
  not_started: 'upcoming',
  in_progress: 'in_progress',
  completed: 'done',
  blocked: 'on_hold',
};

function toPortalMilestone(m: TimelineMilestone): PortalMilestoneView {
  return {
    id: m.id,
    title: m.title,
    status: MILESTONE_STATUS[m.status] ?? 'upcoming',
    startDate: m.startDate,
    endDate: m.endDate,
  };
}

/**
 * The "Open site" row. Only two things qualify: the Webflow custom domain,
 * which is the client's own public site, and a manual link the team has
 * explicitly switched on. Guessing from the title would publish a link whose
 * visibility switch reads OFF in the Client tab — the one place the team goes
 * to check what the client can see.
 */
function detectWebsiteUrl(project: Project): string | undefined {
  const custom = project.webflowConfig?.customDomain;
  if (custom) return custom.startsWith('http') ? custom : `https://${custom}`;
  const live = (project.links || []).find(
    (l) =>
      l.source !== 'auto' &&
      l.clientVisible === true &&
      /live|production|website/i.test(l.title) &&
      !/staging|dev/i.test(l.title),
  );
  return live?.url;
}

function toDeliverable(l: ProjectLink): PortalDeliverableView {
  return { id: l.id, title: l.title, url: l.url };
}

function toAsk(t: Task): PortalAskView {
  const ask: PortalAskView = { id: t.id, title: t.title };
  if (t.dueDate) ask.dueDate = t.dueDate;
  return ask;
}

const MAX_UPDATES = 20;
const MAX_UPDATE_BODY = 2000;

function toUpdate(u: ClientUpdate): PortalUpdateView {
  const view: PortalUpdateView = {
    id: u.id,
    body: String(u.body ?? '').slice(0, MAX_UPDATE_BODY),
    postedAt: u.postedAt,
  };
  const title = u.title?.trim();
  if (title) view.title = title;
  if (u.pinned) view.pinned = true;
  return view;
}

function compact<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/**
 * Projects a project (+ timeline, + tasks) onto the client-facing view.
 *
 * This is the allow-list: nothing reaches the portal page that is not built
 * here, field by field. Internal status/tags, billing, tokens, emails (other
 * than the agency contact), milestone notes/assignees, task descriptions,
 * checklists, audits, images and invoices are all deliberately absent.
 */
export function buildClientPortalView(input: BuildClientPortalViewInput): ClientPortalView {
  const { project, timeline, tasks = [], updates = [], now = new Date() } = input;
  const settings = project.clientPortal;
  const facing = project.clientFacing ?? {};

  const phasesSorted = [...(timeline?.phases ?? [])].sort((a, b) => a.order - b.order);
  const visibleMilestones = (timeline?.milestones ?? []).filter((m) => m.clientVisible === true);

  // A phase earns a place on the client's page only by having something the
  // client can see in it. Otherwise an internal phase title — "Internal QA &
  // buffer", "Invoicing / handover" — would appear as a numbered step, and
  // would pad the "Phase 2 of 6" count with stages that mean nothing to them.
  const phases: PortalPhaseView[] = phasesSorted
    .map((p) => ({
      id: p.id,
      title: p.title,
      order: p.order,
      isCurrent: false,
      milestones: visibleMilestones
        .filter((m) => m.phaseId === p.id)
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.order - b.order)
        .map(toPortalMilestone),
    }))
    .filter((p) => p.milestones.length > 0);

  // Current phase: the team's explicit choice wins; otherwise the first phase
  // (by order) with a visible milestone that is not done. Only real phases
  // take part; the synthetic group appended below never does.
  let currentIndex = facing.currentPhaseId
    ? phases.findIndex((p) => p.id === facing.currentPhaseId)
    : -1;
  if (currentIndex < 0) {
    currentIndex = phases.findIndex((p) => p.milestones.some((m) => m.status !== 'done'));
  }
  if (currentIndex >= 0) phases[currentIndex].isCurrent = true;
  const realPhaseCount = phases.length;

  // Visible milestones with no phase, or whose phase was deleted, still count
  // (progress, next) and still render, under an "Other" group at the end.
  const phaseIds = new Set(phases.map((p) => p.id));
  const ungrouped = visibleMilestones
    .filter((m) => !m.phaseId || !phaseIds.has(m.phaseId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.order - b.order)
    .map(toPortalMilestone);
  if (ungrouped.length > 0) {
    phases.push({ id: '__ungrouped', title: 'Other', order: Number.MAX_SAFE_INTEGER, isCurrent: false, milestones: ungrouped, ungrouped: true });
  }

  const done = visibleMilestones.filter((m) => m.status === 'completed').length;
  const nextMilestoneRaw = visibleMilestones
    .filter((m) => m.status !== 'completed')
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.order - b.order)[0];

  const deliverables = (project.links || [])
    .filter((l) => l.source !== 'auto' && l.clientVisible === true)
    .sort((a, b) => a.order - b.order)
    .map(toDeliverable);

  const asks = tasks
    .filter((t) => t.needsClientInput === true && t.status !== 'done')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order)
    .map(toAsk);

  const updateViews = [...updates]
    .filter((u) => typeof u.body === 'string' && u.body.trim().length > 0)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.postedAt.localeCompare(a.postedAt))
    .slice(0, MAX_UPDATES)
    .map(toUpdate);

  const status = normalizeClientStatus(facing.status);

  const view: ClientPortalView = {
    projectId: project.id,
    projectName: project.name,
    brandName: settings?.brandName?.trim() || project.client?.trim() || project.name,
    brandLogoUrl: settings?.brandLogoUrl || project.logoUrl || undefined,
    welcome: settings?.welcome?.trim() || undefined,
    agencyContactEmail: project.reviewOwnerEmail || project.assigneeEmails?.[0] || undefined,
    websiteUrl: detectWebsiteUrl(project),
    status,
    statusLabel: CLIENT_STATUS_PORTAL_LABELS[status],
    statusNote: facing.statusNote?.trim() || undefined,
    currentPhase:
      currentIndex >= 0
        ? { id: phases[currentIndex].id, title: phases[currentIndex].title, index: currentIndex, total: realPhaseCount }
        : undefined,
    nextMilestone: nextMilestoneRaw ? toPortalMilestone(nextMilestoneRaw) : undefined,
    progress: { done, total: visibleMilestones.length },
    lastUpdateAt: facing.lastUpdateAt || undefined,
    phases,
    deliverables,
    asks,
    updates: updateViews,
    generatedAt: now.toISOString(),
  };

  return compact(view);
}
