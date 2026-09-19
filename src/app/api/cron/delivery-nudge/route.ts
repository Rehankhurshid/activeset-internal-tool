import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { gatherDeliveryNudges } from '@/lib/delivery-nudge';
import {
  deliveryDigestSubject,
  deliveryNudgeSubject,
  sendDeliveryDigestEmail,
  sendDeliveryNudgeEmail,
} from '@/services/NotificationService';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gathered = await gatherDeliveryNudges();
  if (!gathered) {
    return NextResponse.json({ error: 'firebase-admin not configured' }, { status: 503 });
  }

  const { digest, baseUrl } = gathered;
  const recipient = process.env.NOTIFY_EMAIL;

  // This job mails real people every morning, so there has to be a way to see
  // what it would say before it says it. Same auth, no transporter touched.
  if (request.nextUrl.searchParams.get('dryRun') === '1') {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      totalItems: digest.totalItems,
      totalOverdue: digest.totalOverdue,
      digestTo: recipient ?? null,
      digestSubject: deliveryDigestSubject(digest),
      people: digest.people.map((person) => ({
        to: person.assignee,
        subject: deliveryNudgeSubject(person),
        total: person.total,
        overdue: person.overdue,
        allOnTime: person.allOnTime,
        projects: person.projects.map((project) => ({
          projectName: project.projectName,
          items: project.items.map((item) => ({
            title: item.title,
            source: item.source,
            stage: item.stage,
            dueDate: item.dueDate,
            daysOverdue: item.daysOverdue,
            url: item.url,
          })),
        })),
      })),
      active: digest.active,
      skipped: digest.skipped,
    });
  }

  // Sequentially, not Promise.all: Gmail SMTP throttles a burst, and one person's
  // bounce must not cost everybody else their mail.
  const failures: { recipient: string; error: string }[] = [];
  let sent = 0;
  let skipped = 0;

  for (const person of digest.people) {
    try {
      const result = await sendDeliveryNudgeEmail(person, baseUrl);
      if (result === 'sent') sent += 1;
      else skipped += 1;
    } catch (error) {
      failures.push({
        recipient: person.assignee,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let digestSent: 'sent' | 'skipped' = 'skipped';
  if (recipient) {
    try {
      digestSent = await sendDeliveryDigestEmail(digest, baseUrl, recipient);
    } catch (error) {
      failures.push({
        recipient,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    people: digest.people.length,
    sent,
    skipped,
    failed: failures.length,
    failures,
    digest: digestSent,
    digestTo: recipient ?? null,
    totalItems: digest.totalItems,
    totalOverdue: digest.totalOverdue,
    chased: digest.active.length,
    skippedProjects: digest.skipped.length,
  });
}
