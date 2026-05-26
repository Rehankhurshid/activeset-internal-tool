import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { runDailyControlForCurrentProjects } from '@/lib/daily-control';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const result = await runDailyControlForCurrentProjects({
    limit: Number.isFinite(limit) ? limit : undefined,
    includeSlackImport: request.nextUrl.searchParams.get('skipSlack') !== '1',
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
