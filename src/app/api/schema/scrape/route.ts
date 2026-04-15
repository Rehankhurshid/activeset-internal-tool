import { NextRequest, NextResponse } from 'next/server';
import { scrapePageSignals } from '@/services/SchemaMarkupService';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let url: string | undefined;
  try {
    const body = await request.json();
    url = typeof body?.url === 'string' ? body.url : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json(
      { error: 'Missing "url" in request body' },
      { status: 400 }
    );
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json(
        { error: 'URL must use http(s)' },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const signals = await scrapePageSignals(url);
    return NextResponse.json({ success: true, signals });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to scrape page';
    console.error('Schema scrape error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
