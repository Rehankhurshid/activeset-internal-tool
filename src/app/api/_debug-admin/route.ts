import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  const out: Record<string, unknown> = {
    hasFirebaseAdminCredentials,
    appsLength: admin.apps.length,
    rawSet: Boolean(raw),
    rawLength: raw.length,
    rawFirst80: raw.slice(0, 80),
    rawLast40: raw.slice(-40),
    newlineCount: (raw.match(/\n/g) || []).length,
    crCount: (raw.match(/\r/g) || []).length,
  };

  try {
    JSON.parse(raw);
    out.plainJsonParse = 'ok';
  } catch (e) {
    out.plainJsonParse = (e as Error).message;
  }

  try {
    const escaped = raw.trim().replace(/\r/g, '').replace(/\n/g, '\\n');
    JSON.parse(escaped);
    out.escapedJsonParse = 'ok';
  } catch (e) {
    out.escapedJsonParse = (e as Error).message;
  }

  try {
    const snap = await db.collection('projects').doc('y8fkUIxcYDpgPDKq3tyX').get();
    out.firestoreCall = { exists: snap.exists, hasData: snap.data() != null };
  } catch (e) {
    out.firestoreCall = { error: (e as Error).message };
  }

  return NextResponse.json(out);
}
