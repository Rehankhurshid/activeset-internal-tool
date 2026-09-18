import 'server-only';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { ApiAuthError, requireCaller, type AuthedCaller } from '@/lib/api-auth';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { hasModuleAccess } from '@/lib/module-access';
import type { RestrictedModule } from '@/services/AccessControlService';

/**
 * Per-person credentials for the Chrome extensions.
 *
 * The extension cannot hold a Firebase session, and it must not hold the Refrens
 * signing key — that key mints tokens for the whole Refrens account. So the app
 * issues each person an opaque token instead, scoped to one extension, which the
 * proxy routes exchange for a server-side Refrens call.
 *
 * Only the SHA-256 of the token is stored, so a leak of the collection does not
 * yield working credentials. Module access is re-checked on every request rather
 * than baked in at pairing time, so revoking someone in Settings → Team Access
 * takes effect immediately instead of when their token happens to expire.
 *
 * Tokens also carry a hard expiry ({@link EXTENSION_TOKEN_TTL_DAYS}) so a token
 * that was copied off a machine and forgotten stops working on its own. Pairing
 * again issues a fresh one. Records written before expiry existed have no
 * `expiresAt` and stay valid until revoked or re-paired.
 */

const COLLECTION = 'extension_tokens';
const TOKEN_BYTES = 32;

/** How long a freshly issued extension token stays valid. */
export const EXTENSION_TOKEN_TTL_DAYS = 180;
const EXTENSION_TOKEN_TTL_MS = EXTENSION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface ExtensionTokenRecord {
  uid: string;
  email: string;
  extension: string;
  module: RestrictedModule;
  createdAt: string;
  /** ISO timestamp. Absent on tokens issued before expiry existed; those never expire. */
  expiresAt?: string;
  lastUsedAt?: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function collection() {
  if (!hasFirebaseAdminCredentials) {
    throw new Error('[extension-tokens] firebase-admin is not configured');
  }
  return adminDb.collection(COLLECTION);
}

/** Issues a token, replacing any the person already holds for this extension. */
export async function issueExtensionToken(params: {
  uid: string;
  email: string;
  extension: string;
  module: RestrictedModule;
}): Promise<string> {
  await revokeExtensionTokens(params.email, params.extension);

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const issuedAt = Date.now();
  const record: ExtensionTokenRecord = {
    uid: params.uid,
    email: params.email.toLowerCase(),
    extension: params.extension,
    module: params.module,
    createdAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(issuedAt + EXTENSION_TOKEN_TTL_MS).toISOString(),
  };
  await collection().doc(hash(token)).set(record);
  return token;
}

export async function revokeExtensionTokens(email: string, extension: string): Promise<number> {
  const existing = await collection()
    .where('email', '==', email.toLowerCase())
    .where('extension', '==', extension)
    .get();
  await Promise.all(existing.docs.map((d) => d.ref.delete()));
  return existing.size;
}

export class ExtensionAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Verifies `Authorization: Bearer <extension-token>` and re-checks that the
 * holder still has the module. Returns the record on success.
 */
export async function requireExtensionToken(
  req: Request,
  extension: string
): Promise<ExtensionTokenRecord> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ExtensionAuthError(401, 'Missing extension token');

  const ref = collection().doc(hash(token));
  const snap = await ref.get();
  if (!snap.exists) throw new ExtensionAuthError(401, 'Unknown or revoked extension token');

  const record = snap.data() as ExtensionTokenRecord;

  // The document id is already the hash, so this is belt-and-braces against a
  // future lookup that is not keyed by it.
  const a = Buffer.from(hash(token));
  const b = Buffer.from(snap.id);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ExtensionAuthError(401, 'Invalid extension token');
  }

  // Older records have no expiresAt and stay valid. A present-but-unparseable
  // value fails closed rather than granting an open-ended token.
  if (record.expiresAt !== undefined && !(Date.parse(record.expiresAt) > Date.now())) {
    throw new ExtensionAuthError(401, 'Extension token expired — pair again from Internal Tools');
  }

  if (record.extension !== extension) {
    throw new ExtensionAuthError(403, 'Token was issued for a different extension');
  }

  // Re-checked every request so revocation is immediate.
  if (!(await hasModuleAccess(record.email, record.module))) {
    throw new ExtensionAuthError(403, `Access to the ${record.module} module has been removed`);
  }

  void ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => {});
  return record;
}

export function extensionAuthErrorResponse(err: unknown) {
  const status = err instanceof ExtensionAuthError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return Response.json({ error: message }, { status });
}

export type CallerOrExtension =
  | { kind: 'caller'; caller: AuthedCaller }
  | { kind: 'extension'; record: ExtensionTokenRecord };

/**
 * For routes reachable both from the app (Firebase ID token) and from a paired
 * extension (extension token) on the same `Authorization: Bearer` header.
 *
 * The Firebase check runs first because it is the common case for the app; an
 * extension token is not a JWT, so it fails that check cheaply and falls through
 * to the token lookup. When both fail the extension error is what surfaces,
 * since a caller who reached the fallback had no usable session either way.
 */
export async function requireCallerOrExtensionToken(
  req: NextRequest,
  slug: string
): Promise<CallerOrExtension> {
  try {
    return { kind: 'caller', caller: await requireCaller(req) };
  } catch (err) {
    if (!(err instanceof ApiAuthError)) throw err;
  }
  return { kind: 'extension', record: await requireExtensionToken(req, slug) };
}
