import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

/**
 * Server-only store for app-level third-party credentials (one set per
 * integration, not per project). Lives in `app_secrets/{integration}`.
 *
 * Refrens uses ES256 client-side JWT signing — we store the appId, the urlKey
 * (business slug), and the EC private key. Tokens are minted on demand from
 * these values inside RefrensService and never persisted.
 */

const REFRENS_DOC_ID = 'refrens';

interface RefrensSecretsDoc {
  urlKey?: string;
  appId?: string;
  privateKey?: string;
  updatedAt?: string;
}

export interface RefrensCredentials {
  urlKey: string;
  appId: string;
  privateKey: string;
}

function appSecretsCollection() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error(
      '[appSecrets] firebase-admin credentials are not configured; cannot access app_secrets'
    );
  }
  return adminDb.collection(COLLECTIONS.APP_SECRETS);
}

export async function getRefrensCredentials(): Promise<RefrensCredentials | null> {
  const snap = await appSecretsCollection().doc(REFRENS_DOC_ID).get();
  if (!snap.exists) return null;
  const data = snap.data() as RefrensSecretsDoc | undefined;
  if (!data?.urlKey || !data?.appId || !data?.privateKey) return null;
  return { urlKey: data.urlKey, appId: data.appId, privateKey: data.privateKey };
}

export async function setRefrensCredentials(creds: RefrensCredentials): Promise<void> {
  if (!creds.urlKey) throw new Error('urlKey required');
  if (!creds.appId) throw new Error('appId required');
  if (!creds.privateKey) throw new Error('privateKey required');
  await appSecretsCollection().doc(REFRENS_DOC_ID).set(
    {
      urlKey: creds.urlKey,
      appId: creds.appId,
      privateKey: creds.privateKey,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function deleteRefrensCredentials(): Promise<void> {
  const ref = appSecretsCollection().doc(REFRENS_DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.delete();
}

/**
 * Returns the urlKey + appId (safe to surface in the admin UI) and a flag
 * indicating the private key is stored. Never returns the private key itself.
 */
export async function getRefrensConfigStatus(): Promise<{
  configured: boolean;
  urlKey: string | null;
  appId: string | null;
  updatedAt: string | null;
}> {
  const snap = await appSecretsCollection().doc(REFRENS_DOC_ID).get();
  if (!snap.exists) return { configured: false, urlKey: null, appId: null, updatedAt: null };
  const data = snap.data() as RefrensSecretsDoc | undefined;
  return {
    configured: Boolean(data?.urlKey && data?.appId && data?.privateKey),
    urlKey: data?.urlKey ?? null,
    appId: data?.appId ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}
