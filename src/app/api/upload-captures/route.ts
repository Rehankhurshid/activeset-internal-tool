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
/*  Signature verification (mirrors packages/activeset-capture/src/core/signing.ts) */
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
 * Accept multipart upload from the CLI capture tool.
 * Verifies the manifest signature, stores screenshots in Firebase Storage,
 * creates a Firestore doc, and returns a shareable link.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const manifestRaw = formData.get('manifest');
    const projectName = formData.get('projectName') as string | null;

    if (!manifestRaw || typeof manifestRaw !== 'string') {
      return NextResponse.json(
        { error: 'Missing manifest field' },
        { status: 400, headers: corsHeaders }
      );
    }

    const manifest = JSON.parse(manifestRaw);

    // Verify signature — reject unsigned or tampered uploads
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
    const bucket = getBucket();

    // Upload each screenshot file to Firebase Storage
    const screenshots = formData.getAll('screenshots') as File[];
    const uploaded: UploadedScreenshot[] = [];

    for (const file of screenshots) {
      const buffer = Buffer.from(await file.arrayBuffer());

      // filename comes as "device/filename.webp" from the CLI
      const nameParts = (file.name || 'unknown.webp').split('/');
      const device = nameParts.length > 1 ? nameParts[0] : 'desktop';
      const fileName = nameParts.length > 1 ? nameParts[1] : nameParts[0];

      const storagePath = `captures/${runId}/${device}/${fileName}`;
      const contentType = file.type || (fileName.endsWith('.png') ? 'image/png' : 'image/webp');

      const fileRef = bucket.file(storagePath);
      await fileRef.save(buffer, {
        metadata: { contentType },
        public: true,
      });

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      const matchingResult = manifest.results?.find(
        (r: { slug?: string }) => r.slug && fileName.startsWith(r.slug)
      );

      uploaded.push({
        device,
        fileName,
        url: publicUrl,
        originalUrl: matchingResult?.url || '',
      });
    }

    // Save run metadata to Firestore
    const docData = {
      runId,
      projectName: projectName || manifest.run?.projectName || 'Untitled',
      createdAt: new Date().toISOString(),
      screenshotCount: uploaded.length,
      screenshots: uploaded,
      summary: manifest.summary || {},
      settings: manifest.settings || {},
    };

    await db.collection('capture_runs').doc(runId).set(docData);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.activeset.co';
    const shareUrl = `${baseUrl}/captures/${runId}`;

    return NextResponse.json(
      { success: true, runId, shareUrl, screenshotCount: uploaded.length },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[upload-captures] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}
