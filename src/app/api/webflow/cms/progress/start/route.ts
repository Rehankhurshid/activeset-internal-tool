/**
 * Create a run-tracking doc that the CLI and web UI share.
 *
 * Web calls this right before copying the command. The response holds a
 * `runId` + `secret` which get embedded in the copied command so the CLI
 * can POST events back, and the web can poll /events with the same pair.
 *
 * Docs live in Firestore under `cmsRuns/{runId}` with an `events`
 * subcollection. Expires after 1 hour (TTL cleanup handled offline).
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, siteLabel, collectionIds, collectionLabel, expectedImages, actions } = body as {
      siteId?: string;
      siteLabel?: string;
      collectionIds?: string[];
      collectionLabel?: string;
      expectedImages?: number;
      actions?: { ai?: boolean; compress?: boolean; publish?: boolean };
    };

    if (!siteId || !Array.isArray(collectionIds) || collectionIds.length === 0) {
      return NextResponse.json({ error: 'Missing siteId or collectionIds' }, { status: 400 });
    }

    const runId = crypto.randomUUID();
    const secret = crypto.randomBytes(16).toString('hex');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000);

    await db.collection('cmsRuns').doc(runId).set({
      runId,
      secret,
      siteId,
      siteLabel: siteLabel || siteId,
      collectionIds,
      collectionLabel: collectionLabel || collectionIds.join(','),
      expectedImages: expectedImages ?? 0,
      actions: actions ?? { ai: true, compress: true, publish: false },
      status: 'awaiting',
      eventCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    return NextResponse.json({ runId, secret });
  } catch (error) {
    console.error('progress/start error', error);
    return NextResponse.json({ error: 'Failed to create run' }, { status: 500 });
  }
}
