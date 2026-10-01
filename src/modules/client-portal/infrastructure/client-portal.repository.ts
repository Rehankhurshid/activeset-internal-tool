'use client';

import { projectsService } from '@/services/database';
import { fetchAuthed } from '@/lib/api-client';
import type {
  ClientPlan,
  ClientPlanFile,
  ClientPlanStage,
  ClientStatus,
  ClientTimelineSettings,
  MeetingShareStatus,
  ProjectMeeting,
} from '@/types';
import { normalizeClientPlan } from '../domain/client-plan';
import type { ProjectSheetRecord, SheetStagesFrom, SheetTabRole } from '../domain/project-sheet.types';
import { normalizeClientTimelineSettings } from '../domain/client-timeline';

/** What the Client tab gets back from the meetings route. */
export interface MeetingsState {
  meetings: ProjectMeeting[];
  /** Whether FATHOM_API_KEY is set on this deployment. */
  connected: boolean;
  /** The email domains whose calls are filed here. */
  domains: string[];
}

export interface MeetingPatch {
  status?: MeetingShareStatus;
  phaseId?: string;
  /** `null` goes back to Fathom's summary. */
  clientSummary?: string | null;
}

/** Mirror of the JSON returned by /api/client-portal/[projectId]/link. */
export interface PortalLinkState {
  enabled: boolean;
  /** Present after enable/rotate; on GET only when the deployment can re-show it. */
  url: string | null;
  /** Whether GET can re-show the URL (CLIENT_PORTAL_TOKEN_KEY configured). */
  retrievable: boolean;
  issuedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

/** Same row shape as the proposal views endpoint, so ViewsPopover can render both. */
export interface PortalViewRow {
  id: string;
  viewedAt: string;
  country?: string;
  city?: string;
  userAgent?: string;
  referrer?: string;
}

export type PortalLinkAction = 'enable' | 'rotate' | 'disable';

/** What the Client tab gets back from the sheet route. */
export interface ProjectSheetState {
  sheet: ProjectSheetRecord | null;
  /** The address a sheet must be shared with; null when the deployment has no service account. */
  serviceAccountEmail: string | null;
}

export interface ProjectSheetSettings {
  /** `role: null` goes back to what the tab's name says. */
  tab?: { title: string; role: SheetTabRole | null };
  stagesFrom?: SheetStagesFrom;
  showSheetLink?: boolean;
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error || `${fallback} (${res.status})`);
  return body;
}


type ClientPortalRepository = {
  getLinkState(projectId: string): Promise<PortalLinkState>;
  setLink(projectId: string, action: PortalLinkAction): Promise<PortalLinkState>;
  listViews(projectId: string, limit?: number): Promise<PortalViewRow[]>;
  updateClientFacing(
    projectId: string,
    patch: { status?: ClientStatus; statusNote?: string | null; currentStageId?: string | null },
    byEmail: string,
    options?: { touch?: boolean },
  ): Promise<void>;
  markClientUpdated(projectId: string, byEmail: string): Promise<void>;
  updateClientPortalSettings(
    projectId: string,
    patch: { brandName?: string | null; brandLogoUrl?: string | null; welcome?: string | null; contactEmails?: string[] },
  ): Promise<void>;
  editPlan(projectId: string, byEmail: string, edit: (plan: ClientPlan) => ClientPlan): Promise<void>;
  savePlan(projectId: string, plan: ClientPlan, byEmail: string): Promise<void>;
  updateStage(projectId: string, stageId: string, patch: Partial<ClientPlanStage>, byEmail: string): Promise<void>;
  addStage(projectId: string, stage: ClientPlanStage, byEmail: string): Promise<void>;
  removeStage(projectId: string, stageId: string, byEmail: string): Promise<void>;
  moveStage(projectId: string, stageId: string, delta: -1 | 1, byEmail: string): Promise<void>;
  setPlanFiles(projectId: string, files: ClientPlanFile[], byEmail: string): Promise<void>;
  editTimeline(
    projectId: string,
    byEmail: string,
    edit: (settings: ClientTimelineSettings) => ClientTimelineSettings,
  ): Promise<void>;
  setPhaseFiles(projectId: string, phaseId: string, files: ClientPlanFile[], byEmail: string): Promise<void>;
  setTimelineFiles(projectId: string, files: ClientPlanFile[], byEmail: string): Promise<void>;
  setMilestoneHidden(projectId: string, milestoneId: string, hidden: boolean, byEmail: string): Promise<void>;
  setMeetingDomains(projectId: string, domains: string[], byEmail: string): Promise<void>;
  listMeetings(projectId: string): Promise<MeetingsState>;
  syncMeetings(projectId: string): Promise<{ added: number; seen: number; filed: number }>;
  updateMeeting(projectId: string, meetingId: string, patch: MeetingPatch): Promise<ProjectMeeting>;
  getSheet(projectId: string): Promise<ProjectSheetState>;
  bindSheet(projectId: string, url: string): Promise<ProjectSheetState>;
  syncSheet(projectId: string): Promise<ProjectSheetState>;
  updateSheetSettings(projectId: string, settings: ProjectSheetSettings): Promise<ProjectSheetState>;
  unbindSheet(projectId: string): Promise<ProjectSheetState>;
};

async function postSheet(projectId: string, body: Record<string, unknown>, fallback: string): Promise<ProjectSheetState> {
  const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/sheet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<ProjectSheetState>(res, fallback);
}

/**
 * Everything the Client tab needs. Token operations go through the admin-only
 * routes (the client SDK cannot see `client_portal_tokens`); status, branding
 * and visibility are plain project-doc writes through the legacy service.
 */
export const clientPortalRepository: ClientPortalRepository = {
  async getLinkState(projectId: string): Promise<PortalLinkState> {
    const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/link`);
    return readJson<PortalLinkState>(res, 'Failed to load portal link');
  },

  async setLink(projectId: string, action: PortalLinkAction): Promise<PortalLinkState> {
    const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    return readJson<PortalLinkState>(res, 'Failed to update portal link');
  },

  async listViews(projectId: string, limit = 50): Promise<PortalViewRow[]> {
    const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/views?limit=${limit}`);
    const body = await readJson<{ views?: PortalViewRow[] }>(res, 'Failed to load views');
    return body.views ?? [];
  },

  /**
   * `touch: true` also stamps "last updated", which is what the stale-portal
   * nudge reads. Pass it when the team has actually told the client something
   * (the Client tab's Save), not when a status is being tidied from a list.
   */
  updateClientFacing: (
    projectId: string,
    patch: { status?: ClientStatus; statusNote?: string | null; currentStageId?: string | null },
    byEmail: string,
    options: { touch?: boolean } = {},
  ) => projectsService.updateClientFacing(projectId, patch, byEmail, options),

  markClientUpdated: (projectId: string, byEmail: string) => projectsService.markClientUpdated(projectId, byEmail),

  updateClientPortalSettings: (
    projectId: string,
    patch: {
      brandName?: string | null;
      brandLogoUrl?: string | null;
      welcome?: string | null;
      contactEmails?: string[];
    },
  ) => projectsService.updateClientPortalSettings(projectId, patch),

  /**
   * Edits the client plan from its latest stored value (a transaction), always
   * cleaned up on the way in: nothing half-typed or unsafe is ever stored.
   */
  editPlan: (projectId: string, byEmail: string, edit: (plan: ClientPlan) => ClientPlan) =>
    projectsService.updateClientPlan(
      projectId,
      (current) => normalizeClientPlan(edit(normalizeClientPlan(current))),
      byEmail,
    ),

  /** Replaces the whole plan, e.g. when it is first set up or rebuilt from the checklist. */
  savePlan: (projectId: string, plan: ClientPlan, byEmail: string) =>
    projectsService.updateClientPlan(projectId, () => normalizeClientPlan(plan), byEmail),

  updateStage: (projectId: string, stageId: string, patch: Partial<ClientPlanStage>, byEmail: string) =>
    clientPortalRepository.editPlan(projectId, byEmail, (plan) => ({
      ...plan,
      stages: plan.stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch, id: stage.id } : stage)),
    })),

  addStage: (projectId: string, stage: ClientPlanStage, byEmail: string) =>
    clientPortalRepository.editPlan(projectId, byEmail, (plan) => ({ ...plan, stages: [...plan.stages, stage] })),

  removeStage: (projectId: string, stageId: string, byEmail: string) =>
    clientPortalRepository.editPlan(projectId, byEmail, (plan) => ({
      ...plan,
      stages: plan.stages.filter((stage) => stage.id !== stageId),
    })),

  /** Moves a stage one place earlier (-1) or later (+1). */
  moveStage: (projectId: string, stageId: string, delta: -1 | 1, byEmail: string) =>
    clientPortalRepository.editPlan(projectId, byEmail, (plan) => {
      const stages = [...plan.stages];
      const from = stages.findIndex((stage) => stage.id === stageId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= stages.length) return plan;
      [stages[from], stages[to]] = [stages[to], stages[from]];
      return { ...plan, stages };
    }),

  setPlanFiles: (projectId: string, files: ClientPlanFile[], byEmail: string) =>
    clientPortalRepository.editPlan(projectId, byEmail, (plan) => ({ ...plan, files })),

  /** Edits the Timeline's client settings from their latest stored value, cleaned on the way in. */
  editTimeline: (projectId, byEmail, edit) =>
    projectsService.updateClientTimeline(
      projectId,
      (current) => normalizeClientTimelineSettings(edit(normalizeClientTimelineSettings(current))),
      byEmail,
    ),

  setPhaseFiles: (projectId, phaseId, files, byEmail) =>
    clientPortalRepository.editTimeline(projectId, byEmail, (settings) => ({
      ...settings,
      phaseFiles: { ...settings.phaseFiles, [phaseId]: files },
    })),

  setTimelineFiles: (projectId, files, byEmail) =>
    clientPortalRepository.editTimeline(projectId, byEmail, (settings) => ({ ...settings, files })),

  setMilestoneHidden: (projectId, milestoneId, hidden, byEmail) =>
    clientPortalRepository.editTimeline(projectId, byEmail, (settings) => {
      const rest = (settings.hiddenMilestoneIds ?? []).filter((id) => id !== milestoneId);
      return { ...settings, hiddenMilestoneIds: hidden ? [...rest, milestoneId] : rest };
    }),

  setMeetingDomains: (projectId, domains, byEmail) =>
    clientPortalRepository.editTimeline(projectId, byEmail, (settings) => ({ ...settings, meetingDomains: domains })),

  async listMeetings(projectId) {
    const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/meetings`);
    return readJson<MeetingsState>(res, 'Failed to load calls');
  },

  async syncMeetings(projectId) {
    const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' }),
    });
    return readJson<{ added: number; seen: number; filed: number }>(res, 'Could not check Fathom');
  },

  async updateMeeting(projectId, meetingId, patch) {
    const res = await fetchAuthed(
      `/api/client-portal/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) },
    );
    const body = await readJson<{ meeting: ProjectMeeting }>(res, 'Could not update the call');
    return body.meeting;
  },

  async getSheet(projectId) {
    const res = await fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/sheet`);
    return readJson<ProjectSheetState>(res, 'Could not load the project sheet');
  },

  bindSheet: (projectId, url) => postSheet(projectId, { action: 'bind', url }, 'Could not bind the sheet'),
  syncSheet: (projectId) => postSheet(projectId, { action: 'sync' }, 'Could not read the sheet'),
  updateSheetSettings: (projectId, settings) =>
    postSheet(projectId, { action: 'settings', ...settings }, 'Could not save'),
  unbindSheet: (projectId) => postSheet(projectId, { action: 'unbind' }, 'Could not unbind the sheet'),
};
