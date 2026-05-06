import 'server-only';
import nodemailer from 'nodemailer';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { todayIso, daysBetweenIso } from '@/lib/review-status';

const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;

interface PendingProject {
  id: string;
  name: string;
  client?: string;
  daysSince: number | null;
  lastReviewedBy?: string;
}

export interface ReviewDigestResult {
  ok: boolean;
  reason?: string;
  total?: number;
  pending?: number;
  emailed?: boolean;
  recipient?: string;
}

function describeStaleness(p: PendingProject): string {
  if (p.daysSince === null) return 'never reviewed';
  if (p.daysSince === 1) return 'last reviewed yesterday';
  return `last reviewed ${p.daysSince} days ago`;
}

/**
 * Walks current projects, finds the ones not reviewed today, and emails a digest.
 * Idempotent — safe to run on cron.
 */
export async function runReviewDigest(): Promise<ReviewDigestResult> {
  if (!hasFirebaseAdminCredentials) {
    return { ok: false, reason: 'firebase-admin not configured' };
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_EMAIL = process.env.REVIEW_DIGEST_EMAIL || process.env.NOTIFY_EMAIL;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_EMAIL) {
    return { ok: false, reason: 'email config missing' };
  }

  const today = todayIso();

  const snap = await adminDb.collection(PROJECTS_COLLECTION).get();

  const pending: PendingProject[] = [];
  let total = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const status = (data.status as string | undefined) ?? 'current';
    if (status !== 'current') continue;
    total += 1;

    const lastReviewDate = data.lastReviewDate as string | undefined;
    if (lastReviewDate === today) continue; // already reviewed

    pending.push({
      id: doc.id,
      name: (data.name as string | undefined) ?? 'Untitled project',
      client: data.client as string | undefined,
      daysSince: lastReviewDate ? daysBetweenIso(lastReviewDate, today) : null,
      lastReviewedBy: data.lastReviewedBy as string | undefined,
    });
  }

  if (pending.length === 0) {
    return { ok: true, total, pending: 0, emailed: false };
  }

  // Worst-first: never reviewed, then most days since.
  pending.sort((a, b) => {
    if (a.daysSince === null && b.daysSince !== null) return -1;
    if (b.daysSince === null && a.daysSince !== null) return 1;
    return (b.daysSince ?? 0) - (a.daysSince ?? 0);
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://activeset-internal-tool.up.railway.app';

  const rows = pending
    .map((p) => {
      const url = `${baseUrl}/modules/project-links/${p.id}`;
      const clientLabel = p.client ? ` <span style="color:#94a3b8">· ${p.client}</span>` : '';
      const stalenessColor =
        p.daysSince === null ? '#f43f5e' : p.daysSince >= 3 ? '#f43f5e' : '#f59e0b';
      return `
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0;">
            <a href="${url}" style="color:#1e293b; font-weight:600; text-decoration:none;">${p.name}</a>${clientLabel}
          </td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:${stalenessColor}; font-size:13px; white-space:nowrap;">
            ${describeStaleness(p)}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 28px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color:white; margin:0; font-size:22px;">Daily review digest</h1>
        <p style="color:rgba(255,255,255,0.8); margin:6px 0 0; font-size:13px;">
          ${pending.length} of ${total} current ${total === 1 ? 'project still needs' : 'projects still need'} today's review
        </p>
      </div>

      <div style="background:#f8fafc; padding:24px; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px;">
        <table style="width:100%; border-collapse:collapse; background:white; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
          ${rows}
        </table>

        <div style="margin-top:24px; text-align:center;">
          <a href="${baseUrl}/modules/project-links" style="display:inline-block; background:#4f46e5; color:white; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">
            Open dashboard →
          </a>
        </div>

        <p style="margin-top:24px; color:#94a3b8; font-size:12px; text-align:center;">
          Mark a project reviewed from its card. The banner clears once everything is done.
        </p>
      </div>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"ActiveSet Reviews" <${GMAIL_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `Daily reviews — ${pending.length} pending`,
    html,
  });

  return { ok: true, total, pending: pending.length, emailed: true, recipient: NOTIFY_EMAIL };
}
