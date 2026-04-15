/**
 * Provision a schema-gen run. The web UI calls this right before copying the
 * CLI command. The returned `runId` + `secret` are appended as flags so the
 * CLI can POST events back, and the UI polls /events with the same pair.
 *
 * Docs live in Firestore under `schemaRuns/{runId}` with an `events`
 * subcollection — identical shape to `cmsRuns`. Expires after 1 hour.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      siteId,
      siteLabel,
      domain,
      expectedPages,
      model,
      concurrency,
      only,
    } = body as {
      siteId?: string;
      siteLabel?: string;
      domain?: string;
      expectedPages?: number;
      model?: string;
      concurrency?: number;
      only?: string[];
    };

    if (!siteId || !domain) {
      return NextResponse.json(
        { error: 'Missing siteId or domain' },
        { status: 400 }
      );
    }

    const runId = crypto.randomUUID();
    const secret = crypto.randomBytes(16).toString('hex');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 60 * 60 * 1000
    );

    await db.collection('schemaRuns').doc(runId).set({
      runId,
      secret,
      siteId,
      siteLabel: siteLabel || siteId,
      domain,
      expectedPages: expectedPages ?? 0,
      model: model ?? 'gemma4:e4b',
      concurrency: concurrency ?? 1,
      only: only ?? [],
      status: 'awaiting',
      eventCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    return NextResponse.json({ runId, secret });
  } catch (error) {
    console.error('schema progress/start error', error);
    return NextResponse.json({ error: 'Failed to create run' }, { status: 500 });
  }
}
