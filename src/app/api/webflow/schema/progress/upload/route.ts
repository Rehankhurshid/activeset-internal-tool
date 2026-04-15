/**
 * Receive generated schema analyses from the CLI and persist them to
 * Firestore so the dashboard's Results list picks them up automatically —
 * no manual "Import schema-output.json" step needed.
 *
 * Auth: `{ runId, secret }` — the pair was issued by /progress/start and
 * the run doc carries the `projectId` we should write under.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

interface IncomingEntry {
  pageId: string;
  pageTitle?: string;
  url: string;
  contentHash: string;
  result: unknown;
}

// Firestore batch cap is 500 ops; keep headroom.
const BATCH_SIZE = 400;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { runId, secret, model, entries } = body as {
      runId?: string;
      secret?: string;
      model?: string;
      entries?: IncomingEntry[];
    };

    if (!runId || !secret || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: 'Missing runId, secret, or entries[]' },
        { status: 400 }
      );
    }

    const runRef = db.collection('schemaRuns').doc(runId);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return NextResponse.json({ error: 'Unknown runId' }, { status: 404 });
    }
    const run = runSnap.data() as {
      secret?: string;
      projectId?: string | null;
      expiresAt?: admin.firestore.Timestamp;
    };
    if (run.secret !== secret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }
    if (run.expiresAt && run.expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: 'Run expired' }, { status: 410 });
    }
    if (!run.projectId) {
      return NextResponse.json(
        { error: 'Run has no projectId — upload not supported for this run' },
        { status: 400 }
      );
    }

    const col = db.collection('schema_analyses');
    const now = Date.now();
    let written = 0;
    let skipped = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const entry of chunk) {
        if (!entry.pageId || !entry.contentHash) {
          skipped++;
          continue;
        }
        const ref = col.doc(`${entry.pageId}_${entry.contentHash}`);
        batch.set(ref, {
          pageId: entry.pageId,
          projectId: run.projectId,
          contentHash: entry.contentHash,
          url: entry.url,
          result: entry.result,
          model: model ?? 'unknown',
          createdAt: now,
        });
        written++;
      }
      await batch.commit();
    }

    return NextResponse.json({ ok: true, written, skipped });
  } catch (error) {
    console.error('schema progress/upload error', error);
    return NextResponse.json(
      { error: 'Failed to upload entries' },
      { status: 500 }
    );
  }
}
