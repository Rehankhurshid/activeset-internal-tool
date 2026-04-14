import { NextRequest, NextResponse } from 'next/server';
import type { CmsImageEntry } from '@/types/webflow';
import { generateAltForImages } from '@/lib/cms/ai-alt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, siteName, host, model } = body as {
      images: CmsImageEntry[];
      siteName?: string;
      host?: string;
      model?: string;
    };

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 });
    }

    const suggestions = await generateAltForImages(images, { siteName, host, model });
    return NextResponse.json({ success: true, data: { suggestions } });
  } catch (error) {
    console.error('CMS generate-alt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate alt text' },
      { status: 500 }
    );
  }
}
