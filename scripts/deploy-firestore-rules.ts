/**
 * Deploy firestore.rules using the Firebase Admin SDK's securityRules()
 * API. This avoids firebase-tools' Service Usage API check (which requires
 * a role our build service-account doesn't always have).
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/deploy-firestore-rules.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as admin from 'firebase-admin';

const ENV_CANDIDATES = [
  process.env.DEPLOY_ENV_FILE,
  '.env.vercel-production',
  '.env.local',
  '.env',
].filter((v): v is string => typeof v === 'string' && v.length > 0);
for (const p of ENV_CANDIDATES) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`[deploy-rules] loaded env from ${p}`);
    break;
  }
}

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
  const trimmed = raw.trim();
  const escaped = trimmed
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  for (const candidate of [trimmed, escaped]) {
    try {
      const parsed = normalize(JSON.parse(candidate));
      if (parsed) return parsed;
    } catch {
      // try next
    }
  }
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const escDecoded = decoded
      .replace(/\r/g, '')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
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

async function main() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GCLOUD_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('No Firebase service-account JSON in env.');
  }
  const sa = parseServiceAccount(raw);
  if (!sa) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed.');
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      ...sa,
      privateKey: sa.privateKey.replace(/\\n/g, '\n'),
    }),
    projectId: sa.projectId,
  });

  const rulesPath = 'firestore.rules';
  const source = fs.readFileSync(rulesPath, 'utf8');
  console.log(`[deploy-rules] project: ${sa.projectId}`);
  console.log(`[deploy-rules] rules file: ${rulesPath} (${source.length} bytes)`);

  const rules = admin.securityRules();
  const ruleset = await rules.releaseFirestoreRulesetFromSource(source);
  console.log(`[deploy-rules] released ruleset: ${ruleset.name} (at ${ruleset.createTime})`);
  console.log('[deploy-rules] done.');
}

main().catch((err) => {
  console.error('[deploy-rules] fatal:', err);
  process.exit(1);
});
