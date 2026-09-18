'use client';

import { projectsService } from '@/services/database';
import { fetchAuthed } from '@/lib/api-client';
import type { ClientMessage, ClientStatus, ClientUpdate } from '@/types';

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

/**
 * Everything the Client tab needs. Token operations go through the admin-only
 * routes (the client SDK cannot see `client_portal_tokens`); status, branding
 * and visibility are plain project-doc writes through the legacy service.
 */
export const clientPortalRepository = {
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
    patch: { status?: ClientStatus; statusNote?: string | null; currentPhaseId?: string | null },
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
      repliesOpen?: boolean;
    },
  ) => projectsService.updateClientPortalSettings(projectId, patch),

  updateLinkClientVisibility: (projectId: string, linkId: string, clientVisible: boolean) =>
    projectsService.updateLinkClientVisibility(projectId, linkId, clientVisible),

  // --- The conversation ----------------------------------------------------
  // Live subscriptions rather than fetches: the Client tab should show a
  // client's reply the moment it lands, the same way the rest of the app works.

  subscribeToUpdates: (projectId: string, cb: (updates: ClientUpdate[]) => void) =>
    projectsService.subscribeToClientUpdates(projectId, cb),

  postUpdate: (projectId: string, input: { title?: string; body: string; pinned?: boolean }, byEmail: string) =>
    projectsService.postClientUpdate(projectId, input, byEmail),

  editUpdate: (
    projectId: string,
    updateId: string,
    patch: { title?: string | null; body?: string; pinned?: boolean },
  ) => projectsService.updateClientUpdate(projectId, updateId, patch),

  deleteUpdate: (projectId: string, updateId: string) =>
    projectsService.deleteClientUpdate(projectId, updateId),

  subscribeToMessages: (projectId: string, cb: (messages: ClientMessage[]) => void) =>
    projectsService.subscribeToClientMessages(projectId, cb),

  markMessageRead: (projectId: string, messageId: string, byEmail: string) =>
    projectsService.markClientMessageRead(projectId, messageId, byEmail),

  linkMessageToRequest: (projectId: string, messageId: string, requestId: string) =>
    projectsService.linkClientMessageToRequest(projectId, messageId, requestId),
};
