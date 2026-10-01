import type {
  ChecklistSection,
  ClientPlanFile,
  Project,
  ProjectChecklist,
  ProjectMeeting,
  ProjectTimeline,
  StageRole,
  Task,
} from '@/types';
import { CLIENT_STATUS_PORTAL_LABELS, normalizeClientStatus } from '@/types';
import {
  latestChecklistChange,
  legacyClientPlan,
  normalizeClientPlan,
  normalizePlanFiles,
  planTracksChecklist,
  resolveClientPlan,
  safeHttpUrl,
  type ResolvedStage,
} from './client-plan';
import { resolveTimelinePlan, stageForDate, timelineStages, type TimelineStep } from './client-timeline';
import { sheetAsks, sheetChanges, sheetFacts, sheetFiles, sheetReadiness, sheetStageSources, sheetWork } from './project-sheet.portal';
import type { ProjectSheetSnapshot } from './project-sheet.types';
import type {
  ClientPortalView,
  PortalAskView,
  PortalFileView,
  PortalMeetingView,
  PortalReviewView,
  PortalStageView,
  PortalStepView,
} from './client-portal.types';

export interface BuildClientPortalViewInput {
  project: Project;
  /**
   * The Timeline tab. When it has milestones to show, its phases are the
   * client's stages; otherwise it is read only for a portal shared before
   * plans existed (see `legacyClientPlan`).
   */
  timeline: ProjectTimeline | null | undefined;
  /**
   * Recorded calls. Only `shared` ones are used, whatever the caller passes:
   * a summary the team has not read never reaches the client.
   */
  meetings?: ProjectMeeting[];
  /** Optional. Only tasks with `needsClientInput` and not done become asks. */
  tasks?: Task[];
  /**
   * Optional. The checklist the tracker follows, and where a `client_review`
   * stage is found. Only counts and one section title ever leave it.
   */
  checklists?: ProjectChecklist[];
  /**
   * Optional. The project sheet's last snapshot. Its Timeline tab drives the
   * stages unless the team chose the app's Timeline; its inputs, trackers,
   * change log and launch checks add to the page. Only what
   * `project-sheet.portal.ts` builds from it ever reaches the view.
   */
  sheet?: ProjectSheetSnapshot | null;
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

function toStep(step: TimelineStep): PortalStepView {
  const view: PortalStepView = { id: step.id, title: step.title, state: step.state };
  if (step.startDate) view.startDate = step.startDate;
  if (step.endDate) view.endDate = step.endDate;
  if (step.owner) view.owner = step.owner;
  return view;
}

const MAX_SUMMARY = 20_000;

/**
 * A shared call. Attendees by name only: a name the client already knows from
 * the invite, never an address. The team's edit of the summary wins over
 * Fathom's, and the recording is Fathom's public share link, not the team's.
 */
function toMeeting(meeting: ProjectMeeting): PortalMeetingView {
  const names = new Set<string>();
  for (const person of meeting.attendees ?? []) {
    const name = person.name?.trim();
    if (name && !name.includes('@')) names.add(name);
  }
  const view: PortalMeetingView = {
    id: meeting.id,
    title: meeting.title?.trim() || 'Call',
    date: meeting.startedAt,
    attendees: [...names].slice(0, 16),
    nextSteps: (meeting.actionItems ?? [])
      .filter((item) => item && typeof item.text === 'string' && item.text.trim())
      .slice(0, 30)
      .map((item) => {
        const owner = item.owner?.trim();
        return owner && !owner.includes('@') ? { text: item.text.trim(), owner } : { text: item.text.trim() };
      }),
  };
  const start = Date.parse(meeting.startedAt);
  const end = meeting.endedAt ? Date.parse(meeting.endedAt) : NaN;
  if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) view.durationMinutes = Math.round((end - start) / 60_000);
  const summary = (meeting.clientSummary?.trim() || meeting.summary?.trim() || '').slice(0, MAX_SUMMARY);
  if (summary) view.summary = summary;
  const recording = safeHttpUrl(meeting.shareUrl);
  if (recording) view.recordingUrl = recording;
  return view;
}

/** Shared calls, each in the stage it was filed under, else the one its date falls in. */
function placeMeetings(stages: PortalStageView[], meetings: ProjectMeeting[]): void {
  if (stages.length === 0) return;
  const ids = new Set(stages.map((s) => s.id));
  const shared = meetings
    .filter((m) => m && m.status === 'shared' && typeof m.startedAt === 'string')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const meeting of shared) {
    const target =
      meeting.phaseId && ids.has(meeting.phaseId)
        ? meeting.phaseId
        : stageForDate(
            stages.map((s) => ({ id: s.id, startDate: s.startDate, dueDate: s.dueDate })),
            meeting.startedAt,
          );
    const stage = stages.find((s) => s.id === target);
    if (!stage) continue;
    (stage.meetings ??= []).push(toMeeting(meeting));
  }
}

function toAsk(t: Task): PortalAskView {
  const ask: PortalAskView = { id: t.id, title: t.title };
  if (t.dueDate) ask.dueDate = t.dueDate;
  return ask;
}

/**
 * Sheet asks and task asks together, soonest first; asks with no date go last.
 * A task flagged for the client that repeats a sheet input word for word is
 * the same ask, so it shows once.
 */
function mergeAsks(fromSheet: PortalAskView[], fromTasks: PortalAskView[]): PortalAskView[] {
  const sheetTitles = new Set(fromSheet.map((a) => a.title.trim().toLowerCase()));
  return [...fromSheet, ...fromTasks.filter((a) => !sheetTitles.has(a.title.trim().toLowerCase()))]
    .map((ask, order) => ({ ask, order }))
    .sort((a, b) => (a.ask.dueDate ?? '9999').localeCompare(b.ask.dueDate ?? '9999') || a.order - b.order)
    .map(({ ask }) => ask);
}

/** Files once each, by address. */
function dedupeFiles(files: PortalFileView[]): PortalFileView[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.url) ? false : (seen.add(f.url), true)));
}

function isoOf(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) || d.getTime() === 0 ? undefined : d.toISOString();
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
  const { project, timeline, tasks = [], checklists = [], meetings = [], sheet = null, now = new Date() } = input;
  const settings = project.clientPortal;
  const facing = project.clientFacing ?? {};
  const status = normalizeClientStatus(facing.status);

  // The project sheet's Timeline first, unless the team chose the app's and it
  // has something to show; then the Timeline tab; then the plan.
  const appSources = timelineStages(timeline, project.clientTimeline);
  const sheetSources = sheet ? sheetStageSources(sheet.data.timeline) : [];
  const fromSheet = sheetSources.length > 0 && !(sheet?.stagesFrom === 'app' && appSources.length > 0);
  const fromTimeline = !fromSheet && appSources.length > 0;
  const timelineSources = fromSheet ? sheetSources : appSources;
  const byPhase = fromSheet || fromTimeline;

  // Otherwise the saved plan; failing that, what a portal shared before plans
  // existed was already showing, so the client's page does not empty out.
  const saved = !byPhase && project.clientPlan ? normalizeClientPlan(project.clientPlan) : null;
  const legacy =
    byPhase || saved
      ? null
      : legacyClientPlan({ timeline, links: project.links, currentPhaseId: facing.currentPhaseId });
  const plan = saved ?? legacy?.plan ?? null;
  const resolved = byPhase
    ? resolveTimelinePlan(timelineSources, { currentStageId: facing.currentStageId, status })
    : plan
      ? resolveClientPlan(plan, checklists, {
          currentStageId: saved ? facing.currentStageId : legacy?.currentStageId,
          status,
        })
      : null;

  const stages = resolved ? resolved.stages.map(toStage) : [];
  if (byPhase) {
    stages.forEach((stage, index) => {
      stage.steps = timelineSources[index].steps.map(toStep);
    });
  }
  placeMeetings(stages, meetings);
  const currentStageIndex = resolved && resolved.currentIndex >= 0 ? resolved.currentIndex : undefined;
  const sharedMeetings = meetings.filter((m) => m?.status === 'shared');

  const taskAsks = tasks
    .filter((t) => t.needsClientInput === true && t.status !== 'done')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order)
    .map(toAsk);
  const fromSheetAsks = sheet ? sheetAsks(sheet) : { asks: [], received: 0 };
  const asks = mergeAsks(fromSheetAsks.asks, taskAsks);

  const baseFiles = byPhase ? normalizePlanFiles(project.clientTimeline?.files).map(toFile) : (plan?.files ?? []).map(toFile);
  const files = sheet ? dedupeFiles([...sheetFiles(sheet), ...baseFiles]) : baseFiles;
  const work = sheet ? sheetWork(sheet.data, new Set(stages.map((s) => s.id))) : [];
  const changes = sheet ? sheetChanges(sheet.data) : [];
  const readiness = sheet ? sheetReadiness(sheet.data) : [];

  const view: ClientPortalView = {
    projectId: project.id,
    projectName: project.name,
    brandName: settings?.brandName?.trim() || project.client?.trim() || project.name,
    brandLogoUrl: settings?.brandLogoUrl || project.logoUrl || undefined,
    welcome: settings?.welcome?.trim() || undefined,
    agencyContactEmail: project.reviewOwnerEmail || project.assigneeEmails?.[0] || undefined,
    websiteUrl: detectWebsiteUrl(project, !saved && !byPhase),
    status,
    statusLabel: CLIENT_STATUS_PORTAL_LABELS[status],
    statusNote: facing.statusNote?.trim() || undefined,
    lastUpdateAt: latestIso([
      facing.lastUpdateAt,
      saved?.updatedAt,
      // A tick on the checklist moves the tracker, so it is news to the client too.
      !byPhase && resolved && planTracksChecklist(resolved) ? latestChecklistChange(checklists) : undefined,
      // So is a milestone moving on the Timeline, a file added to a phase, or a call shared.
      fromTimeline ? isoOf(timeline?.updatedAt) : undefined,
      byPhase ? project.clientTimeline?.updatedAt : undefined,
      // The sheet changing between two syncs is news too, whichever section it moved.
      sheet?.changedAt,
      ...sharedMeetings.map((m) => m.decidedAt),
    ]),
    planSource: fromSheet ? 'sheet' : fromTimeline ? 'timeline' : 'plan',
    facts: sheet ? sheetFacts(sheet.data.overview) : undefined,
    stages,
    currentStageIndex,
    files,
    asks,
    asksReceived: fromSheetAsks.received > 0 ? fromSheetAsks.received : undefined,
    work: work.length ? work : undefined,
    changes: changes.length ? changes : undefined,
    readiness: readiness.length ? readiness : undefined,
    sheetUrl: sheet?.showSheetLink && sheet.url ? sheet.url : undefined,
    review: toPortalReview(checklists, project.delivery?.approvals),
    generatedAt: now.toISOString(),
  };

  return compact(view);
}
