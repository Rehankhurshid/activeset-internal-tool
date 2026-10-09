import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import {
  deliveryDigestBaseUrl,
  gatherPendingDeliveryUpdates,
  markDeliveryUpdatesDigested,
} from '@/lib/delivery-evening-digest';
import { sendDeliveryEveningDigestEmail } from '@/services/NotificationService';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pending = await gatherPendingDeliveryUpdates();
  if (!pending) {
    return NextResponse.json({ error: 'firebase-admin not configured' }, { status: 503 });
  }

  const recipient = process.env.NOTIFY_EMAIL;

  if (request.nextUrl.searchParams.get('dryRun') === '1') {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      count: pending.length,
      to: recipient ?? null,
      updates: pending.map((u) => ({
        projectId: u.projectId,
        projectName: u.projectName,
        by: u.by,
        summary: u.summary,
        kind: u.kind,
      })),
    });
  }

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 'skipped', reason: 'no updates today' });
  }

  if (!recipient) {
    return NextResponse.json({ ok: false, error: 'NOTIFY_EMAIL not set' }, { status: 503 });
  }

  const result = await sendDeliveryEveningDigestEmail(pending, deliveryDigestBaseUrl(), recipient);
  if (result === 'sent') {
    await markDeliveryUpdatesDigested(
      pending.map((u) => ({ projectId: u.projectId, updateId: u.id })),
    );
  }

  return NextResponse.json({ ok: true, sent: result, count: pending.length, to: recipient });
}
