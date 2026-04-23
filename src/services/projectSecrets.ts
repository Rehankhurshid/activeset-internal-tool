import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

/**
 * Server-only store for per-project third-party API tokens.
 *
 * Tokens live in the `project_secrets/{projectId}` collection and MUST only be
 * read/written via firebase-admin (bypassing Firestore rules, which deny all
 * client reads of this collection). This keeps tokens out of any document the
 * browser or a public/CORS-open endpoint can ever see.
 */

interface ProjectSecretsDoc {
  webflowApiToken?: string;
  webflowTokenUpdatedAt?: string;
}

function secretsCollection() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error(
      '[projectSecrets] firebase-admin credentials are not configured; cannot access project_secrets'
    );
  }
  return adminDb.collection(COLLECTIONS.PROJECT_SECRETS);
}

export async function getWebflowToken(projectId: string): Promise<string | null> {
  if (!projectId) return null;
  const snap = await secretsCollection().doc(projectId).get();
  if (!snap.exists) return null;
  const data = snap.data() as ProjectSecretsDoc | undefined;
  return data?.webflowApiToken ?? null;
}

export async function setWebflowToken(projectId: string, apiToken: string): Promise<void> {
  if (!projectId) throw new Error('projectId required');
  if (!apiToken) throw new Error('apiToken required');
  await secretsCollection().doc(projectId).set(
    {
      webflowApiToken: apiToken,
      webflowTokenUpdatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function deleteWebflowToken(projectId: string): Promise<void> {
  if (!projectId) return;
  const ref = secretsCollection().doc(projectId);
  const snap = await ref.get();
  if (!snap.exists) return;
  // Fully delete the doc if webflow was the only secret. If more secret
  // types land later, switch to FieldValue.delete() on the specific field.
  await ref.delete();
}

export async function hasWebflowToken(projectId: string): Promise<boolean> {
  if (!projectId) return false;
  const snap = await secretsCollection().doc(projectId).get();
  if (!snap.exists) return false;
  const data = snap.data() as ProjectSecretsDoc | undefined;
  return Boolean(data?.webflowApiToken);
}
