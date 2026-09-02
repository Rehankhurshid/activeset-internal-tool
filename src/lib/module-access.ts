import 'server-only';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import type { RestrictedModule } from '@/services/AccessControlService';

/**
 * Server-side mirror of AccessControlService.checkAccess.
 *
 * AccessControlService runs on the client with the Firebase web SDK, so it
 * cannot be reused from a route handler. The document shape and the "*" wildcard
 * are the same — keep the two in step if either changes.
 */

interface ModuleAccessDoc {
  modules?: Record<string, string[]>;
}

export async function hasModuleAccess(
  email: string,
  module: RestrictedModule
): Promise<boolean> {
  if (!hasFirebaseAdminCredentials) return false;

  const snap = await adminDb.collection('access_control').doc('module_access').get();
  if (!snap.exists) return false;

  const users = (snap.data() as ModuleAccessDoc | undefined)?.modules?.[module] ?? [];
  if (users.includes('*')) return true;

  const wanted = email.toLowerCase();
  return users.some((e) => e.toLowerCase() === wanted);
}
