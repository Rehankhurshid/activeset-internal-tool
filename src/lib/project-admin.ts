import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import type { Project, ProjectLink } from '@/types';

/**
 * Reading projects with firebase-admin, for code that runs outside Next.
 *
 * `audit-admin.ts` is marked `server-only`, which is right for app code — it
 * stops a route's server helpers being pulled into a client bundle — and
 * fatal for a plain Node process: the worker and the CLI both died on
 * `Cannot find module 'server-only'`. The loaders they share live here, with
 * no such guard, and `audit-admin` re-exports them.
 */

export class AdminCredentialsMissingError extends Error {
  constructor() {
    super('No Firebase admin credentials. Run: npx vercel env pull .env.local');
    this.name = 'AdminCredentialsMissingError';
  }
}

function projects() {
  if (!hasFirebaseAdminCredentials) throw new AdminCredentialsMissingError();
  return adminDb.collection(COLLECTIONS.PROJECTS);
}

/** One project document. No audits — that is a read per page and rarely wanted. */
export async function loadProjectDocAdmin(projectId: string): Promise<Project | null> {
  const snapshot = await projects().doc(projectId).get();
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...(snapshot.data() as Omit<Project, 'id'>) } as Project;
}

/** Every project document. For picking which to work on. */
export async function loadAllProjectDocsAdmin(): Promise<Project[]> {
  const snapshot = await projects().get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Project, 'id'>) }) as Project);
}

/**
 * The project's Webflow token. `services/projectSecrets` is `server-only`, so
 * the worker cannot import it; the secret is read directly here instead. It
 * never leaves the machine that reads it.
 */
export async function getWebflowTokenAdmin(projectId: string): Promise<string | null> {
  if (!hasFirebaseAdminCredentials) throw new AdminCredentialsMissingError();
  const snapshot = await adminDb.collection('project_secrets').doc(projectId).get();
  if (!snapshot.exists) return null;
  return (snapshot.data() as { webflowApiToken?: string } | undefined)?.webflowApiToken ?? null;
}

export function linkOf(project: Project, linkId: string): ProjectLink | undefined {
  return (project.links ?? []).find((link) => link.id === linkId);
}
