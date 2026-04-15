/**
 * Poll endpoint for the schema-gen web UI. Returns events for a run, optionally
 * filtered to those newer than `since` (ms epoch). Auth: `{ runId, secret }`.
 *
 * Shape mirrors /event: step, level, message, detail, current, total,
 * durationMs, at. `at` is serialized as ms epoch so the client can diff
 * cheaply on subsequent polls.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const secret = searchParams.get('secret');
    const sinceParam = searchParams.get('since');

    if (!runId || !secret) {
      return NextResponse.json(
        { error: 'Missing runId or secret' },
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
      status?: string;
      eventCount?: number;
      lastStep?: string;
      lastMessage?: string;
      createdAt?: admin.firestore.Timestamp;
      updatedAt?: admin.firestore.Timestamp;
      expiresAt?: admin.firestore.Timestamp;
      siteLabel?: string;
      domain?: string;
      expectedPages?: number;
    };
    if (run.secret !== secret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    let query: admin.firestore.Query = runRef
      .collection('events')
      .orderBy('at', 'asc');
    if (sinceParam) {
      const sinceMs = Number(sinceParam);
      if (Number.isFinite(sinceMs) && sinceMs > 0) {
        const sinceTs = admin.firestore.Timestamp.fromMillis(sinceMs);
        query = query.where('at', '>', sinceTs);
      }
    }

    const snap = await query.limit(500).get();
    const events = snap.docs.map((doc) => {
      const data = doc.data() as {
        step: string;
        level: string;
        message: string;
        detail?: string | null;
        current?: number | null;
        total?: number | null;
        durationMs?: number | null;
        at: admin.firestore.Timestamp;
      };
      return {
        id: doc.id,
        step: data.step,
        level: data.level,
        message: data.message,
        detail: data.detail ?? null,
        current: data.current ?? null,
        total: data.total ?? null,
        durationMs: data.durationMs ?? null,
        at: data.at.toMillis(),
      };
    });

    return NextResponse.json({
      run: {
        status: run.status ?? 'awaiting',
        eventCount: run.eventCount ?? 0,
        lastStep: run.lastStep ?? null,
        lastMessage: run.lastMessage ?? null,
        siteLabel: run.siteLabel ?? null,
        domain: run.domain ?? null,
        expectedPages: run.expectedPages ?? 0,
        createdAt: run.createdAt ? run.createdAt.toMillis() : null,
        updatedAt: run.updatedAt ? run.updatedAt.toMillis() : null,
        expiresAt: run.expiresAt ? run.expiresAt.toMillis() : null,
      },
      events,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('schema progress/events error', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
