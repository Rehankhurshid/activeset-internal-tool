/**
 * One-time migration: move Webflow API tokens from
 *   projects/{id}.webflowConfig.apiToken
 * into the new server-only collection
 *   project_secrets/{id}.webflowApiToken
 *
 * For each project that currently has an apiToken on its webflowConfig:
 *   1. Writes the token to project_secrets/{id} (server-only).
 *   2. Strips `apiToken` from projects/{id}.webflowConfig.
 *   3. Sets projects/{id}.webflowConfig.hasApiToken = true.
 *
 * Idempotent — projects that have already been migrated are skipped.
 *
 * Usage:
 *   DRY RUN   (default):  tsx scripts/migrate-webflow-tokens.ts
 *   LIVE:                 tsx scripts/migrate-webflow-tokens.ts --apply
 *
 * Loads admin credentials from FIREBASE_SERVICE_ACCOUNT_JSON (or the other
 * env var names that src/lib/firebase-admin.ts accepts). Pulls an env file
 * first (e.g. via `vercel env pull .env.vercel-production`) and run with
 *   dotenv -e .env.vercel-production -- tsx scripts/migrate-webflow-tokens.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as admin from 'firebase-admin';

// Load env from the first file that exists, in priority order.
const ENV_CANDIDATES = [
  process.env.MIGRATE_ENV_FILE,
  '.env.vercel-production',
  '.env.local',
  '.env',
].filter((v): v is string => typeof v === 'string' && v.length > 0);
for (const path of ENV_CANDIDATES) {
  if (fs.existsSync(path)) {
    dotenv.config({ path });
    console.log(`[migrate-webflow-tokens] loaded env from ${path}`);
    break;
  }
}

const APPLY = process.argv.includes('--apply');

function parseServiceAccount(raw: string): admin.ServiceAccount | null {
  const normalize = (v: unknown): admin.ServiceAccount | null => {
    if (!v || typeof v !== 'object') return null;
    const r = v as Record<string, unknown>;
    const projectId = (r.projectId || r.project_id) as string | undefined;
    const clientEmail = (r.clientEmail || r.client_email) as string | undefined;
    const privateKey = (r.privateKey || r.private_key) as string | undefined;
    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey };
  };
  // JSON forbids raw control chars in strings, but Vercel's env roundtrip
  // often leaves real newlines inside the private_key. Escape them first.
  const trimmed = raw.trim();
  const escaped = trimmed
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  const attempts = [trimmed, escaped];
  for (const candidate of attempts) {
    try {
      const parsed = normalize(JSON.parse(candidate));
      if (parsed) return parsed;
    } catch {
      // try next
    }
  }
  // Try base64-decoded raw.
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const escDecoded = decoded.replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
    for (const candidate of [decoded, escDecoded]) {
      try {
        const parsed = normalize(JSON.parse(candidate));
        if (parsed) return parsed;
      } catch {
        // try next
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function initAdmin() {
  if (admin.apps.length) return;
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GCLOUD_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'No Firebase service-account JSON found. Expected FIREBASE_SERVICE_ACCOUNT_JSON (or similar) to be set.'
    );
  }
  const sa = parseServiceAccount(raw);
  if (!sa) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed.');
  }
  if (!sa.privateKey) {
    throw new Error('parsed service account is missing privateKey');
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      ...sa,
      privateKey: sa.privateKey.replace(/\\n/g, '\n'),
    }),
    projectId: sa.projectId,
  });
}

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '•'.repeat(token.length);
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

interface LegacyWebflowConfig {
  siteId?: string;
  apiToken?: string;
  siteName?: string;
  customDomain?: string;
  lastSyncedAt?: string;
  hasApiToken?: boolean;
}

async function main() {
  initAdmin();
  const db = admin.firestore();

  console.log(`[migrate-webflow-tokens] mode=${APPLY ? 'APPLY (writing)' : 'DRY RUN'}`);
  console.log(`[migrate-webflow-tokens] scanning projects collection…`);

  const snap = await db.collection('projects').get();
  let inspected = 0;
  let needsMigration = 0;
  let alreadyMigrated = 0;
  let noToken = 0;
  let migrated = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    inspected += 1;
    const data = doc.data() as { webflowConfig?: LegacyWebflowConfig } | undefined;
    const cfg = data?.webflowConfig;

    if (!cfg || typeof cfg !== 'object') {
      noToken += 1;
      continue;
    }

    const hasLegacyToken = typeof cfg.apiToken === 'string' && cfg.apiToken.length > 0;
    if (!hasLegacyToken) {
      if (cfg.hasApiToken) alreadyMigrated += 1;
      else noToken += 1;
      continue;
    }

    needsMigration += 1;
    const id = doc.id;
    console.log(
      `  • ${id} (${cfg.siteName || cfg.siteId || 'unnamed'}) — token ${maskToken(cfg.apiToken!)}`
    );

    if (!APPLY) continue;

    try {
      const secretsRef = db.collection('project_secrets').doc(id);
      const projectRef = db.collection('projects').doc(id);

      await db.runTransaction(async (tx) => {
        tx.set(
          secretsRef,
          {
            webflowApiToken: cfg.apiToken,
            webflowTokenUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        tx.update(projectRef, {
          'webflowConfig.apiToken': admin.firestore.FieldValue.delete(),
          'webflowConfig.hasApiToken': true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      migrated += 1;
    } catch (err) {
      errors += 1;
      console.error(`    ✗ failed for ${id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('');
  console.log('[migrate-webflow-tokens] summary:');
  console.log(`  inspected:        ${inspected}`);
  console.log(`  already migrated: ${alreadyMigrated}`);
  console.log(`  no token on doc:  ${noToken}`);
  console.log(`  needs migration:  ${needsMigration}`);
  console.log(`  migrated:         ${migrated}`);
  console.log(`  errors:           ${errors}`);
  if (!APPLY && needsMigration > 0) {
    console.log('');
    console.log('  This was a DRY RUN — re-run with --apply to write changes.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate-webflow-tokens] fatal:', err);
    process.exit(1);
  });
