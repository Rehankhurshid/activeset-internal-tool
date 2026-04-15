/**
 * Append a progress event for an existing schema-gen run. Called by the local
 * CLI (`@activeset/schema-gen`).
 *
 * Auth: `{ runId, secret }` — the pair was issued by /progress/start. This
 * uses the admin SDK; request validation is the whole security boundary.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

type EventLevel = 'info' | 'success' | 'warn' | 'error';
type EventStep =
  | 'connect'
  | 'fetch'
  | 'scrape'
  | 'analyze'
  | 'write'
  | 'upload'
  | 'done'
  | 'abort';

interface IncomingEvent {
  step: EventStep;
  level?: EventLevel;
  message: string;
  detail?: string;
  current?: number;
  total?: number;
  durationMs?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { runId, secret, event } = body as {
      runId?: string;
      secret?: string;
      event?: IncomingEvent;
    };

    if (!runId || !secret || !event || !event.step || !event.message) {
      return NextResponse.json(
        { error: 'Missing runId, secret, or event fields' },
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
      expiresAt?: admin.firestore.Timestamp;
    };
    if (run.secret !== secret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }
    if (run.expiresAt && run.expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: 'Run expired' }, { status: 410 });
    }

    const now = admin.firestore.Timestamp.now();
    const eventRef = runRef.collection('events').doc();
    await eventRef.set({
      step: event.step,
      level: event.level ?? 'info',
      message: event.message.slice(0, 500),
      detail: event.detail ? event.detail.slice(0, 1000) : null,
      current: event.current ?? null,
      total: event.total ?? null,
      durationMs: event.durationMs ?? null,
      at: now,
    });

    let status: 'awaiting' | 'running' | 'completed' | 'aborted' = 'running';
    if (event.step === 'done') status = 'completed';
    else if (event.step === 'abort') status = 'aborted';

    await runRef.update({
      status,
      updatedAt: now,
      eventCount: admin.firestore.FieldValue.increment(1),
      lastStep: event.step,
      lastMessage: event.message.slice(0, 200),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('schema progress/event error', error);
    return NextResponse.json(
      { error: 'Failed to record event' },
      { status: 500 }
    );
  }
}
