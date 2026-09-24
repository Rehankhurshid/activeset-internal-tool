'use client';

import { projectsService } from '@/services/database';
import { fetchAuthed } from '@/lib/api-client';
import type { ClientPlan, ClientPlanFile, ClientPlanStage, ClientStatus } from '@/types';
import { normalizeClientPlan } from '../domain/client-plan';

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
};

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
};
