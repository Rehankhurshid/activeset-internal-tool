import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
// Import db first — this triggers firebase-admin initialization as a side effect.
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/* ------------------------------------------------------------------ */
/*  Signature verification                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_KEY = 'activeset-capture-v1';

function getKey(): string {
  return process.env.ACTIVESET_UPLOAD_KEY || DEFAULT_KEY;
}

interface ManifestForSigning {
  schemaVersion: number;
  run: { id: string; projectName: string; startedAt: string; finishedAt: string };
  summary: {
    totalUrls: number;
    successfulUrls: number;
    failedUrls: number;
    totalDurationMs: number;
  };
  signature?: string;
}

function verifySignature(manifest: ManifestForSigning, signature: string): boolean {
  const payload = [
    `schema:${manifest.schemaVersion}`,
    `run:${manifest.run.id}`,
    `project:${manifest.run.projectName}`,
    `started:${manifest.run.startedAt}`,
    `finished:${manifest.run.finishedAt}`,
    `urls:${manifest.summary.totalUrls}`,
    `success:${manifest.summary.successfulUrls}`,
    `failed:${manifest.summary.failedUrls}`,
    `duration:${manifest.summary.totalDurationMs}`,
  ].join('|');

  const expected = createHmac('sha256', getKey()).update(payload).digest('hex');

  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

function getBucket() {
  void db; // ensure side-effect init
  if (!admin.apps.length) {
    throw new Error('Firebase admin is not initialized. Check server credentials.');
  }
  return admin.storage().bucket();
}

interface UploadedScreenshot {
  device: string;
  fileName: string;
  url: string;
  originalUrl: string;
}

/**
 * Chunked upload protocol — one screenshot per request to stay under
 * Vercel's 4.5MB body limit. No signed URLs needed.
 *
 * Phase "init": CLI sends manifest JSON. Server verifies signature,
 *   creates Firestore doc, returns runId.
 *
 * Phase "file": CLI sends one screenshot per request (multipart) with runId.
 *   Server stores in Firebase Storage, appends to Firestore doc.
 *
 * Phase "finalize": CLI signals all uploads done. Server returns share URL.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Detect phase from either JSON or multipart
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const phase = body.phase;

      /* ============================================================ */
      /*  Phase: init — register manifest, return runId                */
      /* ============================================================ */
      if (phase === 'init') {
        const { manifest, projectName } = body as {
          manifest: ManifestForSigning & { results?: unknown[]; settings?: unknown };
          projectName?: string;
        };

        if (!manifest) {
          return NextResponse.json(
            { error: 'Missing manifest' },
            { status: 400, headers: corsHeaders }
          );
        }

        const signature = manifest.signature;
        if (!signature || typeof signature !== 'string') {
          return NextResponse.json(
            { error: 'Missing manifest signature. Only captures from @activeset/capture are accepted.' },
            { status: 401, headers: corsHeaders }
          );
        }

        if (!verifySignature(manifest, signature)) {
          return NextResponse.json(
            { error: 'Invalid manifest signature. Upload rejected.' },
            { status: 401, headers: corsHeaders }
          );
        }

        const runId = manifest.run?.id || `run-${Date.now()}`;

        let expectedCount = 0;
        for (const result of (manifest.results as Array<{ deviceResults?: Array<{ success?: boolean; outputPath?: string }> }>) || []) {
          for (const dr of result.deviceResults || []) {
            if (dr.success && dr.outputPath) expectedCount++;
          }
        }

        const docData = {
          runId,
          projectName: projectName || manifest.run?.projectName || 'Untitled',
          createdAt: new Date().toISOString(),
          status: 'uploading',
          screenshotCount: 0,
          expectedCount,
          screenshots: [] as UploadedScreenshot[],
          summary: manifest.summary || {},
          settings: manifest.settings || {},
        };

        await db.collection('capture_runs').doc(runId).set(docData);

        return NextResponse.json(
          { success: true, runId, expectedCount },
          { headers: corsHeaders }
        );
      }

      /* ============================================================ */
      /*  Phase: finalize — return share URL                           */
      /* ============================================================ */
      if (phase === 'finalize') {
        const { runId } = body as { runId: string };
        if (!runId) {
          return NextResponse.json(
            { error: 'Missing runId' },
            { status: 400, headers: corsHeaders }
          );
        }

        const docRef = db.collection('capture_runs').doc(runId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          return NextResponse.json(
            { error: 'Unknown runId' },
            { status: 404, headers: corsHeaders }
          );
        }

        await docRef.update({ status: 'complete' });

        const data = docSnap.data()!;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.activeset.co';
        const shareUrl = `${baseUrl}/captures/${runId}`;

        return NextResponse.json(
          { success: true, runId, shareUrl, screenshotCount: data.screenshotCount || 0 },
          { headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { error: `Unknown phase: ${phase}` },
        { status: 400, headers: corsHeaders }
      );
    }

    /* ================================================================ */
    /*  Phase: file — multipart, one screenshot per request              */
    /* ================================================================ */
    const formData = await request.formData();
    const phase = formData.get('phase') as string;

    if (phase === 'file') {
      const runId = formData.get('runId') as string;
      const device = formData.get('device') as string;
      const originalUrl = (formData.get('originalUrl') as string) || '';
      const file = formData.get('screenshot') as File | null;

      if (!runId || !device || !file) {
        return NextResponse.json(
          { error: 'Missing runId, device, or screenshot file' },
          { status: 400, headers: corsHeaders }
        );
      }

      const docRef = db.collection('capture_runs').doc(runId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json(
          { error: 'Unknown runId. Call phase=init first.' },
          { status: 404, headers: corsHeaders }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name || 'screenshot.webp';
      const fileContentType = file.type || (fileName.endsWith('.png') ? 'image/png' : 'image/webp');

      const bucket = getBucket();
      const storagePath = `captures/${runId}/${device}/${fileName}`;

      const fileRef = bucket.file(storagePath);
      await fileRef.save(buffer, {
        metadata: { contentType: fileContentType },
        public: true,
      });

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      const screenshotEntry: UploadedScreenshot = {
        device,
        fileName,
        url: publicUrl,
        originalUrl,
      };

      await docRef.update({
        screenshots: admin.firestore.FieldValue.arrayUnion(screenshotEntry),
        screenshotCount: admin.firestore.FieldValue.increment(1),
      });

      return NextResponse.json(
        { success: true, url: publicUrl },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Invalid request. Send JSON with phase=init/finalize or multipart with phase=file.' },
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[upload-captures] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}
