import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { gatherDevDeliveryNudges, markDevNudgeSent } from '@/lib/delivery-dev-nudge';
import { sendDevDeliveryNudgeEmail, sendDevDeliveryNudgeSlack } from '@/services/NotificationService';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const candidates = await gatherDevDeliveryNudges();
  if (!candidates) {
    return NextResponse.json({ error: 'firebase-admin not configured' }, { status: 503 });
  }

  if (request.nextUrl.searchParams.get('dryRun') === '1') {
    return NextResponse.json({ ok: true, dryRun: true, count: candidates.length, candidates });
  }

  const failures: { projectId: string; error: string }[] = [];
  let emailed = 0;
  let slacked = 0;

  for (const row of candidates) {
    try {
      const emailResult = await sendDevDeliveryNudgeEmail(row);
      if (emailResult === 'sent') emailed += 1;
      const slackResult = await sendDevDeliveryNudgeSlack(row);
      if (slackResult === 'sent') slacked += 1;
      await markDevNudgeSent(row.projectId);
    } catch (error) {
      failures.push({
        projectId: row.projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    emailed,
    slacked,
    failures,
  });
}
