import * as dotenv from 'dotenv';

/**
 * Load the env files, before anything else is imported.
 *
 * This exists because of an ordering trap that cost a debugging session.
 * `src/lib/firebase-admin.ts` decides whether it has credentials while its
 * module body runs, and ES module imports are evaluated before any top-level
 * statement in the importing file. So a script written the obvious way —
 *
 *   import { queue } from '@/lib/worker/queue';   // firebase-admin loads here
 *   dotenv.config({ path: '.env.local' });        // ...and only now is env set
 *
 * initialises firebase-admin against an empty environment every time, and
 * reports "no admin credentials" however well the env file is populated.
 *
 * Importing this module *first* fixes it, because imports run in order.
 *
 * Order of the files matters too. Vercel stores some values as Secrets and
 * `vercel env pull` writes "[SENSITIVE]" in their place, so a pulled
 * production file must never overwrite a real local one. dotenv keeps the
 * first value it sees, and `.env.local` is read first.
 */

for (const path of ['.env.local', '.env.vercel-production', '.env']) {
  dotenv.config({ path, quiet: true });
}

/** Values Vercel refuses to export, so a caller can say so rather than failing oddly. */
const PLACEHOLDERS = new Set(['[SENSITIVE]', '[SECRET]']);

export function isPlaceholder(value: string | undefined): boolean {
  return !!value && PLACEHOLDERS.has(value.trim());
}

/** Reads an env var, treating a pull placeholder as absent. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return isPlaceholder(value) ? undefined : value;
}
