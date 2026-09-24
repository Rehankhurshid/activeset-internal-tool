import type {
  ChecklistSection,
  ClientPlanFile,
  Project,
  ProjectChecklist,
  ProjectTimeline,
  StageRole,
  Task,
} from '@/types';
import { CLIENT_STATUS_PORTAL_LABELS, normalizeClientStatus } from '@/types';
import {
  latestChecklistChange,
  legacyClientPlan,
  normalizeClientPlan,
  planTracksChecklist,
  resolveClientPlan,
  type ResolvedStage,
} from './client-plan';
import type {
  ClientPortalView,
  PortalAskView,
  PortalFileView,
  PortalReviewView,
  PortalStageView,
} from './client-portal.types';

export interface BuildClientPortalViewInput {
  project: Project;
  /** Read only for a portal shared before plans existed (see `legacyClientPlan`). */
  timeline: ProjectTimeline | null | undefined;
  /** Optional. Only tasks with `needsClientInput` and not done become asks. */
  tasks?: Task[];
  /**
   * Optional. The checklist the tracker follows, and where a `client_review`
   * stage is found. Only counts and one section title ever leave it.
   */
  checklists?: ProjectChecklist[];
  now?: Date;
}

/**
 * "Open site". The Webflow custom domain is the client's own public site. A
 * manual link switched on for the client counts too, but only on a portal that
 * has no plan yet: those switches no longer exist, and a link nobody can turn
 * off again must not stay on the page forever.
 */
function detectWebsiteUrl(project: Project, legacy: boolean): string | undefined {
  const custom = project.webflowConfig?.customDomain;
  if (custom) return custom.startsWith('http') ? custom : `https://${custom}`;
  if (!legacy) return undefined;
  const live = (project.links || []).find(
    (l) =>
      l.source !== 'auto' &&
      l.clientVisible === true &&
      /live|production|website/i.test(l.title) &&
      !/staging|dev/i.test(l.title),
  );
  return live?.url;
}

function toFile(file: ClientPlanFile): PortalFileView {
  return { id: file.id, title: file.title, url: file.url };
}

function toStage(resolved: ResolvedStage): PortalStageView {
  const { stage } = resolved;
  const view: PortalStageView = {
    id: stage.id,
    title: stage.title,
    state: resolved.state,
    deliverables: [...stage.deliverables],
    files: stage.files.map(toFile),
  };
  if (stage.startDate) view.startDate = stage.startDate;
  if (stage.dueDate) view.dueDate = stage.dueDate;
  if (resolved.state === 'current' && resolved.percent !== undefined) view.percent = resolved.percent;
  return view;
}

function toAsk(t: Task): PortalAskView {
  const ask: PortalAskView = { id: t.id, title: t.title };
  if (t.dueDate) ask.dueDate = t.dueDate;
  return ask;
}

/** The latest of some ISO timestamps, or undefined when none parse. */
function latestIso(values: (string | undefined)[]): string | undefined {
  let best = 0;
  for (const value of values) {
    const ms = value ? Date.parse(value) : NaN;
    if (!Number.isNaN(ms) && ms > best) best = ms;
  }
  return best > 0 ? new Date(best).toISOString() : undefined;
}

function compact<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/**
 * The stage the client is being asked to sign off, if any.
 *
 * Duplicated from the delivery module's `roleOf` rather than imported, because
 * the portal projection is the app's narrowest allow-list and reaching into
 * another module's domain to build it would be the wrong direction of
 * dependency. Two lines is a fair price for that.
 */
function reviewRoleOf(section: ChecklistSection): StageRole | undefined {
  if (section.role) return section.role;
  return section.stage === 'kickoff' || section.stage === 'launch' ? section.stage : undefined;
}

function toPortalReview(
  checklists: ProjectChecklist[],
  approvals: NonNullable<Project['delivery']>['approvals'],
): PortalReviewView | undefined {
  const reviews: PortalReviewView[] = [];

  for (const checklist of checklists) {
    const sections = [...(checklist.sections ?? [])].sort((a, b) => a.order - b.order);
    for (const section of sections) {
      if (reviewRoleOf(section) !== 'client_review') continue;
      const stageKey = `${checklist.id}:${section.id}`;
      const approval = (approvals ?? []).find((a) => a.stageKey === stageKey);
      reviews.push({
        stageKey,
        title: section.title,
        ...(approval ? { approvedAt: approval.approvedAt } : {}),
        ...(approval?.note ? { approvedNote: approval.note } : {}),
      });
    }
  }

  // A project has more than one review point — staging feedback partway through,
  // then final sign-off — so show the one actually waiting on them. Once they
  // have all been answered, show the last, so their most recent approval stays
  // on the page rather than the card vanishing the moment they press the button.
  return reviews.find((r) => !r.approvedAt) ?? reviews[reviews.length - 1];
}

/**
 * Projects a project (+ checklist, + tasks) onto the client's dashboard.
 *
 * This is the allow-list: nothing reaches the portal page that is not built
 * here, field by field. Internal status/tags, billing, tokens, emails (other
 * than the agency contact), checklist steps, milestone notes/assignees, task
 * descriptions, audits, images and invoices are all deliberately absent. From
 * the checklist the client gets a percentage and one section title (the stage
 * they are asked to approve), never a step.
 */
export function buildClientPortalView(input: BuildClientPortalViewInput): ClientPortalView {
  const { project, timeline, tasks = [], checklists = [], now = new Date() } = input;
  const settings = project.clientPortal;
  const facing = project.clientFacing ?? {};
  const status = normalizeClientStatus(facing.status);

  // The saved plan; failing that, what a portal shared before plans existed
  // was already showing, so the client's page does not empty out under them.
  const saved = project.clientPlan ? normalizeClientPlan(project.clientPlan) : null;
  const legacy = saved
    ? null
    : legacyClientPlan({ timeline, links: project.links, currentPhaseId: facing.currentPhaseId });
  const plan = saved ?? legacy?.plan ?? null;
  const resolved = plan
    ? resolveClientPlan(plan, checklists, {
        currentStageId: saved ? facing.currentStageId : legacy?.currentStageId,
        status,
      })
    : null;

  const stages = resolved ? resolved.stages.map(toStage) : [];
  const currentStageIndex = resolved && resolved.currentIndex >= 0 ? resolved.currentIndex : undefined;

  const asks = tasks
    .filter((t) => t.needsClientInput === true && t.status !== 'done')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order)
    .map(toAsk);

  const view: ClientPortalView = {
    projectId: project.id,
    projectName: project.name,
    brandName: settings?.brandName?.trim() || project.client?.trim() || project.name,
    brandLogoUrl: settings?.brandLogoUrl || project.logoUrl || undefined,
    welcome: settings?.welcome?.trim() || undefined,
    agencyContactEmail: project.reviewOwnerEmail || project.assigneeEmails?.[0] || undefined,
    websiteUrl: detectWebsiteUrl(project, !saved),
    status,
    statusLabel: CLIENT_STATUS_PORTAL_LABELS[status],
    statusNote: facing.statusNote?.trim() || undefined,
    lastUpdateAt: latestIso([
      facing.lastUpdateAt,
      saved?.updatedAt,
      // A tick on the checklist moves the tracker, so it is news to the client too.
      resolved && planTracksChecklist(resolved) ? latestChecklistChange(checklists) : undefined,
    ]),
    stages,
    currentStageIndex,
    files: (plan?.files ?? []).map(toFile),
    asks,
    review: toPortalReview(checklists, project.delivery?.approvals),
    generatedAt: now.toISOString(),
  };

  return compact(view);
}
