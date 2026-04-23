'use client';

import { auth } from '@/lib/firebase';
import type { WebflowConfig, WebflowConfigInput } from '@/types/webflow';

export interface WebflowConfigRepository {
  updateWebflowConfig: (projectId: string, config: WebflowConfigInput) => Promise<void>;
  removeWebflowConfig: (projectId: string) => Promise<void>;
}

async function getIdToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const idToken = await getIdToken();
  const headers = new Headers(init.headers);
  if (idToken) headers.set('Authorization', `Bearer ${idToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}

export const webflowConfigRepository: WebflowConfigRepository = {
  async updateWebflowConfig(projectId, config) {
    const res = await authedFetch('/api/webflow/config', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        siteId: config.siteId,
        apiToken: config.apiToken,
        siteName: config.siteName,
        customDomain: config.customDomain,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save Webflow configuration');
    }
  },

  async removeWebflowConfig(projectId) {
    const res = await authedFetch(
      `/api/webflow/config?projectId=${encodeURIComponent(projectId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to remove Webflow configuration');
    }
  },
};

export type { WebflowConfig };
