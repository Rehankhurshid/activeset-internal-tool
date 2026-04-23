'use client';

import { auth } from '@/lib/firebase';

/**
 * Client-side helper for calling server API routes that need to act on a
 * Webflow-connected project.
 *
 * The server routes never trust a token from the client — the client passes
 * only the projectId + its Firebase ID token, and the server looks up the
 * Webflow API token from the server-only `project_secrets` collection after
 * verifying the user owns the project.
 */

async function getIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export interface ProjectApiInit extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

/**
 * fetch() wrapper that auto-attaches `Authorization: Bearer <firebase-id-token>`
 * and `x-project-id: <projectId>`. Use this for every client call into
 * `/api/webflow/*` that needs a Webflow token server-side.
 */
export async function fetchForProject(
  projectId: string,
  input: RequestInfo | URL,
  init: ProjectApiInit = {}
): Promise<Response> {
  const idToken = await getIdToken();
  const headers: Record<string, string> = {
    ...(init.headers || {}),
    'x-project-id': projectId,
  };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  return fetch(input, { ...init, headers });
}
