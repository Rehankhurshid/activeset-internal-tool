/**
 * Deploy firestore.indexes.json directly against the Firestore Admin API,
 * bypassing firebase-tools' Service Usage API check (which requires a role
 * our build service account doesn't have). Idempotent — existing indexes
 * return 409 and are ignored.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/deploy-firestore-indexes.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const ENV_CANDIDATES = [
  process.env.DEPLOY_ENV_FILE,
  '.env.vercel-production',
  '.env.local',
  '.env',
].filter((v): v is string => typeof v === 'string' && v.length > 0);
for (const p of ENV_CANDIDATES) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`[deploy-indexes] loaded env from ${p}`);
    break;
  }
}

interface IndexField {
  fieldPath: string;
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
}

interface IndexDef {
  collectionGroup: string;
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
  fields: IndexField[];
}

interface IndexesFile {
  indexes: IndexDef[];
}

function parseServiceAccountCredentials(): object {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_CREDENTIALS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('No Firebase service-account JSON in env.');
  const escaped = raw
    .trim()
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  for (const candidate of [raw.trim(), escaped]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed as object;
    } catch {
      // try next
    }
  }
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') return parsed as object;
  } catch {
    // fall through
  }
  throw new Error('Could not parse service account JSON');
}

async function main() {
  const credentials = parseServiceAccountCredentials() as { project_id?: string };
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    credentials.project_id;
  if (!projectId) throw new Error('No project id available.');

  const raw = fs.readFileSync('firestore.indexes.json', 'utf8');
  const parsed = JSON.parse(raw) as IndexesFile;
  const indexes = parsed.indexes || [];

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();

  console.log(`[deploy-indexes] project: ${projectId}`);
  console.log(`[deploy-indexes] found ${indexes.length} index definitions`);

  for (const idx of indexes) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/${encodeURIComponent(idx.collectionGroup)}/indexes`;
    const body = {
      queryScope: idx.queryScope,
      fields: idx.fields,
    };
    try {
      const res = await client.request({
        url,
        method: 'POST',
        data: body,
        validateStatus: () => true,
      });
      const status = res.status;
      if (status >= 200 && status < 300) {
        console.log(`[deploy-indexes] created ${idx.collectionGroup}: ${(res.data as { name?: string }).name || 'ok'}`);
      } else if (status === 409) {
        console.log(`[deploy-indexes] exists  ${idx.collectionGroup} (${idx.fields.map((f) => f.fieldPath).join('+')})`);
      } else {
        console.error(`[deploy-indexes] failed ${idx.collectionGroup}: HTTP ${status}`, res.data);
      }
    } catch (err) {
      console.error(`[deploy-indexes] error ${idx.collectionGroup}:`, err);
    }
  }

  console.log('[deploy-indexes] done.');
}

main().catch((err) => {
  console.error('[deploy-indexes] fatal:', err);
  process.exit(1);
});
