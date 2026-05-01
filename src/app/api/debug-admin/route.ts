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

  // Mirror the exact call /api/project/[id]/route.ts makes to spot any divergence
  try {
    const id = 'y8fkUIxcYDpgPDKq3tyX';
    const snap = await db.collection('projects').doc(id).get();
    out.routeMirror = {
      exists: snap.exists,
      keys: Object.keys(snap.data() || {}),
    };
  } catch (e) {
    out.routeMirror = { error: (e as Error).message };
  }

  // Also test what /api/project/[id]/checklist/route.ts hits
  try {
    const snap = await db
      .collection('project_checklists')
      .doc('y8fkUIxcYDpgPDKq3tyX')
      .get();
    out.checklistCall = { exists: snap.exists };
  } catch (e) {
    out.checklistCall = { error: (e as Error).message };
  }

  return NextResponse.json(out);
}
