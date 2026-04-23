import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import '@/lib/firebase-admin'; // ensure admin is initialized
import type { CmsCompressResult } from '@/types/webflow';
import { compressBuffer, downloadImage, extFromUrl, extFromContentType } from '@/lib/cms/compress';
import { ApiAuthError, apiAuthErrorResponse, requireProjectAccess } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, projectId, collectionId, itemId, fieldSlug } = body as {
      imageUrl: string;
      projectId: string;
      collectionId: string;
      itemId: string;
      fieldSlug: string;
    };

    if (!imageUrl || !projectId || !collectionId || !itemId || !fieldSlug) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
      await requireProjectAccess(request, projectId);
    } catch (err) {
      if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
      throw err;
    }

    // 1. Download
    const { buffer: originalBuffer, contentType } = await downloadImage(imageUrl);
    const ext = extFromUrl(imageUrl) || extFromContentType(contentType);

    // 2. Convert to lossless WebP (skips SVG/GIF)
    const result = await compressBuffer(originalBuffer, ext);

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        data: {
          originalUrl: imageUrl,
          compressedUrl: imageUrl,
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          savings: 0,
        } satisfies CmsCompressResult,
      });
    }

    // 3. Upload compressed WebP to Firebase Storage
    const bucket = admin.storage().bucket();
    const storagePath = `cms-compressed/${projectId}/${collectionId}/${itemId}/${fieldSlug}.${result.ext}`;
    const fileRef = bucket.file(storagePath);

    await fileRef.save(result.buffer, {
      metadata: { contentType: result.contentType },
      public: true,
    });

    const compressedUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    return NextResponse.json({
      success: true,
      data: {
        originalUrl: imageUrl,
        compressedUrl,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        savings: result.savings,
      } satisfies CmsCompressResult,
    });
  } catch (error) {
    console.error('CMS compress error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compress image' },
      { status: 500 }
    );
  }
}
