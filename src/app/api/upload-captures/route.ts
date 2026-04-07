import { NextRequest, NextResponse } from 'next/server';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '@/lib/firebase';
import { db } from '@/lib/firebase-admin';

const storage = getStorage(app);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

interface UploadedScreenshot {
  device: string;
  fileName: string;
  url: string;
  originalUrl: string;
}

/**
 * Accept multipart upload from the CLI capture tool.
 * Stores screenshots in Firebase Storage, creates a Firestore doc,
 * and returns a shareable link.
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
    const runId = manifest.run?.id || `run-${Date.now()}`;

    // Upload each screenshot file to Firebase Storage
    const screenshots = formData.getAll('screenshots') as File[];
    const uploaded: UploadedScreenshot[] = [];

    for (const file of screenshots) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const uint8Array = new Uint8Array(buffer);

      // filename comes as "device/filename.webp" from the CLI
      const nameParts = (file.name || 'unknown.webp').split('/');
      const device = nameParts.length > 1 ? nameParts[0] : 'desktop';
      const fileName = nameParts.length > 1 ? nameParts[1] : nameParts[0];

      const storagePath = `captures/${runId}/${device}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      const contentType = file.type || (fileName.endsWith('.png') ? 'image/png' : 'image/webp');
      await uploadBytes(storageRef, uint8Array, { contentType });
      const downloadUrl = await getDownloadURL(storageRef);

      // Try to find the original URL from manifest results
      const slugBase = fileName.replace(/\.\w+$/, '');
      const matchingResult = manifest.results?.find(
        (r: { slug?: string }) => r.slug && fileName.startsWith(r.slug)
      );

      uploaded.push({
        device,
        fileName,
        url: downloadUrl,
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
