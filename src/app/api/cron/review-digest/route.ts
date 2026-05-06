import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { runReviewDigest } from '@/lib/review-digest';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runReviewDigest();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? 'unknown' }, { status: 503 });
  }
  return NextResponse.json(result);
}
