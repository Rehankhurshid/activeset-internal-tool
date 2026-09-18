import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as admin from 'firebase-admin';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

/**
 * Client portal capability tokens.
 *
 * A portal link is `/portal/<token>`; the token is the only credential. Tokens
 * are minted here (256 bits, base64url) and stored in the admin-only
 * `client_portal_tokens` collection under their SHA-256 hash. The raw token is
 * NOT persisted: when CLIENT_PORTAL_TOKEN_KEY is configured it is stored
 * AES-256-GCM encrypted so the Client tab can re-show the link; without the key
 * the link is shown once (in the enable/rotate response) and Rotate issues a
 * new one. A Firestore export therefore never yields working portal URLs.
 *
 * One active token per project, enforced by a transaction plus a pointer on
 * the project doc (`clientPortal.activeTokenHash`). Verification requires ALL
 * of: the record exists and is active and unexpired, the project exists with
 * `clientPortal.enabled === true`, and the project's pointer names this
 * record. Rotate = revoke + issue; disable = revoke + enabled false. Every
 * rejection performs the same reads and fails the same way.
 */

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const KEY_ENV = 'CLIENT_PORTAL_TOKEN_KEY';

export interface ClientPortalTokenRecord {
  projectId: string;
  /** Reserved for the Phase 3 clients entity / company-level links. */
  clientId?: string;
  /** Optional label, e.g. a contact's name, for per-contact links later. */
  label?: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  lastUsedAt?: string;
  useCount: number;
  /** base64(iv | authTag | ciphertext) of the raw token; absent when no key was configured. */
  tokenCiphertext?: string;
}

export const hashPortalToken = (token: string) => createHash('sha256').update(token).digest('hex');

function collection() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error('[client-portal-tokens] firebase-admin is not configured');
  }
  return adminDb.collection(COLLECTIONS.CLIENT_PORTAL_TOKENS);
}

function projectRef(projectId: string) {
  return adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
}

export function isWellFormedPortalToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

// ---------------------------------------------------------------------------
// At-rest encryption of the raw token (optional, keyed by CLIENT_PORTAL_TOKEN_KEY)
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer | null {
  const raw = process.env[KEY_ENV];
  if (!raw) return null;
  const trimmed = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (buf.length !== 32) {
    console.error(`[client-portal-tokens] ${KEY_ENV} must be 32 bytes (hex or base64); ignoring it`);
    return null;
  }
  return buf;
}

/** True when the deployment can re-show existing links (key configured). */
export function canRetrievePortalTokens(): boolean {
  return encryptionKey() !== null;
}

function encryptToken(token: string): string | undefined {
  const key = encryptionKey();
  if (!key) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decryptToken(ciphertext: string | undefined): string | null {
  const key = encryptionKey();
  if (!key || !ciphertext) return null;
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const token = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return isWellFormedPortalToken(token) ? token : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Issue / revoke (transactional)
// ---------------------------------------------------------------------------

export interface IssuedPortalToken {
  /** The raw token — returned once; only re-retrievable when a key is configured. */
  token: string;
  tokenHash: string;
  record: ClientPortalTokenRecord;
}

/**
 * Issues a fresh token for the project. In ONE transaction it revokes every
 * active token for the project, creates the new record, and points the
 * project doc at it (`clientPortal.activeTokenHash`, `clientPortal.enabled =
 * true`, `clientPortal.tokenIssuedAt`). Concurrent calls serialise; the last
 * writer wins and every other token is dead by construction.
 */
export async function issuePortalToken(params: {
  projectId: string;
  createdBy: string;
  label?: string;
  expiresAt?: string;
}): Promise<IssuedPortalToken> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashPortalToken(token);
  const now = new Date().toISOString();
  const record: ClientPortalTokenRecord = {
    projectId: params.projectId,
    active: true,
    createdBy: params.createdBy.toLowerCase(),
    createdAt: now,
    useCount: 0,
  };
  if (params.label) record.label = params.label;
  if (params.expiresAt) record.expiresAt = params.expiresAt;
  const ciphertext = encryptToken(token);
  if (ciphertext) record.tokenCiphertext = ciphertext;

  const col = collection();
  await adminDb.runTransaction(async (tx) => {
    const active = await tx.get(col.where('projectId', '==', params.projectId).where('active', '==', true));
    for (const doc of active.docs) {
      tx.update(doc.ref, { active: false, revokedAt: now, revokedBy: record.createdBy });
    }
    tx.set(col.doc(tokenHash), record);
    tx.update(projectRef(params.projectId), {
      'clientPortal.enabled': true,
      'clientPortal.activeTokenHash': tokenHash,
      'clientPortal.tokenIssuedAt': now,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  });

  return { token, tokenHash, record };
}

/**
 * Revokes every active token for the project and clears the pointer; with
 * `disable` it also flips `clientPortal.enabled` off. Transactional for the
 * same reason as issue. Returns how many records were revoked.
 */
export async function revokePortalTokens(
  projectId: string,
  revokedBy: string,
  options: { disable?: boolean } = {},
): Promise<number> {
  const col = collection();
  const now = new Date().toISOString();
  return adminDb.runTransaction(async (tx) => {
    const active = await tx.get(col.where('projectId', '==', projectId).where('active', '==', true));
    for (const doc of active.docs) {
      tx.update(doc.ref, { active: false, revokedAt: now, revokedBy: revokedBy.toLowerCase() });
    }
    const patch: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
      'clientPortal.activeTokenHash': admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.Timestamp.now(),
    };
    if (options.disable) patch['clientPortal.enabled'] = false;
    tx.update(projectRef(projectId), patch);
    return active.size;
  });
}

export interface ActivePortalToken {
  tokenHash: string;
  record: ClientPortalTokenRecord;
  /** Decrypted raw token, or null when this deployment cannot re-show links. */
  token: string | null;
}

/**
 * The project's current token, resolved through the project's pointer (not a
 * query), so a stray record can never be reported as the live link.
 */
export async function getActivePortalToken(projectId: string): Promise<ActivePortalToken | null> {
  const projectSnap = await projectRef(projectId).get();
  const portal = (projectSnap.data() as { clientPortal?: { activeTokenHash?: unknown } } | undefined)?.clientPortal;
  const tokenHash = typeof portal?.activeTokenHash === 'string' ? portal.activeTokenHash : null;
  if (!tokenHash) return null;
  const snap = await collection().doc(tokenHash).get();
  if (!snap.exists) return null;
  const record = snap.data() as ClientPortalTokenRecord;
  if (record.active !== true || record.projectId !== projectId) return null;
  return { tokenHash, record, token: decryptToken(record.tokenCiphertext) };
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export class PortalAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

export interface VerifiedPortalToken {
  record: ClientPortalTokenRecord;
  tokenHash: string;
  projectId: string;
  /** Raw project document data (firebase-admin), already known to have the portal enabled. */
  project: Record<string, unknown>;
}

const REJECT = () => new PortalAuthError(404, 'This link is no longer active');
/** Hash of an impossible token, so malformed input still costs the same reads. */
const NULL_HASH = hashPortalToken('');
/**
 * Stand-in project id for the read we make when there is no token record, so
 * every rejection path costs the same two reads.
 *
 * It must be a VALID document id. Firestore reserves ids matching `__.*__`, and
 * the obvious `__none__` is rejected by the backend with "Key path element must
 * not be incomplete" — which surfaced as a 500 on every portal request instead
 * of the uniform 404. Firestore also generates 20-character ids, so a longer
 * hyphenated name cannot collide with a real project.
 */
const NO_SUCH_PROJECT_ID = 'client-portal-no-such-project-sentinel';

/**
 * Resolves a raw token to its record and project, or throws PortalAuthError.
 * Every rejection path performs the same two reads and throws the same error,
 * so response timing and shape do not reveal why a link stopped working.
 */
export async function verifyPortalToken(token: unknown): Promise<VerifiedPortalToken> {
  if (!hasFirebaseAdminCredentials) {
    throw new PortalAuthError(503, 'Portal is not configured on this deployment');
  }

  const wellFormed = isWellFormedPortalToken(token);
  const tokenHash = wellFormed ? hashPortalToken(token) : NULL_HASH;

  const tokenSnap = await collection().doc(tokenHash).get();
  const record = tokenSnap.exists ? (tokenSnap.data() as ClientPortalTokenRecord) : null;
  const projectId = record?.projectId || NO_SUCH_PROJECT_ID;
  const projectSnap = await projectRef(projectId).get();
  const project = projectSnap.exists ? ((projectSnap.data() || {}) as Record<string, unknown>) : null;
  const portal = project?.clientPortal as { enabled?: unknown; activeTokenHash?: unknown } | undefined;

  const hashMatches = (() => {
    const a = Buffer.from(tokenHash);
    const b = Buffer.from(tokenSnap.id);
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  const pointerMatches = (() => {
    const pointer = typeof portal?.activeTokenHash === 'string' ? portal.activeTokenHash : '';
    const a = Buffer.from(pointer.padEnd(64, '#'));
    const b = Buffer.from(tokenHash.padEnd(64, '#'));
    return a.length === b.length && timingSafeEqual(a, b) && pointer.length === tokenHash.length;
  })();

  const ok =
    wellFormed &&
    record !== null &&
    hashMatches &&
    record.active === true &&
    !record.revokedAt &&
    !(record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) &&
    project !== null &&
    portal?.enabled === true &&
    pointerMatches;

  if (!ok || !record || !project) throw REJECT();
  return { record, tokenHash, projectId: record.projectId, project };
}

/** Usage stamp on the token record (never touches the project). Awaited by the beacon. */
export async function touchPortalToken(tokenHash: string): Promise<void> {
  try {
    await collection()
      .doc(tokenHash)
      .update({ lastUsedAt: new Date().toISOString(), useCount: admin.firestore.FieldValue.increment(1) });
  } catch (err) {
    console.error('[client-portal-tokens] failed to stamp token usage:', err);
  }
}
