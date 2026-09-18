import 'server-only';
import nodemailer from 'nodemailer';
import { readFirstEnv } from '@/lib/runtime-env';
import { getBaseUrl } from '@/lib/base-url';
import { postMessage, SlackError, type SlackBlock } from '@/lib/slack';

/**
 * Tells the team when a client writes from their portal.
 *
 * Every send is best-effort: a client pressing Send must never see an error
 * because Gmail or Slack is unhappy, so the caller runs this detached and the
 * functions here resolve rather than throw. Both channels are optional — with
 * no credentials configured the message is simply stored and the Client tab
 * picks it up on its live subscription.
 *
 * The client's text is included so the team can triage from their inbox, but
 * it is escaped before it goes into HTML: it is untrusted input from outside
 * the company.
 */

export interface ClientMessageNotice {
  projectId: string;
  projectName: string;
  clientName?: string;
  body: string;
  authorName?: string;
  /** True when the message came back attached to one of our asks. */
  answeredAsk?: boolean;
}

const MAX_QUOTED = 1200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function quoted(body: string): string {
  return body.length > MAX_QUOTED ? `${body.slice(0, MAX_QUOTED)}…` : body;
}

function who(notice: ClientMessageNotice): string {
  const name = notice.authorName?.trim();
  const client = notice.clientName?.trim();
  if (name && client) return `${name} (${client})`;
  return name || client || 'The client';
}

async function sendEmail(notice: ClientMessageNotice, url: string): Promise<'sent' | 'skipped'> {
  const gmailUser = readFirstEnv(['GMAIL_USER']);
  const gmailAppPassword = readFirstEnv(['GMAIL_APP_PASSWORD']);
  const notifyEmail = readFirstEnv(['CLIENT_PORTAL_NOTIFY_EMAIL', 'NOTIFY_EMAIL']);
  if (!gmailUser || !gmailAppPassword || !notifyEmail) return 'skipped';

  const subject = `${who(notice)} replied — ${notice.projectName}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <div style="font-size:18px;font-weight:600;margin-bottom:4px;">${escapeHtml(subject)}</div>
      <div style="font-size:14px;color:#64748b;margin-bottom:16px;">
        ${notice.answeredAsk ? 'In reply to something we asked for.' : 'A new message from the client portal.'}
      </div>
      <div style="white-space:pre-wrap;border-left:3px solid #e2e8f0;padding:4px 0 4px 12px;font-size:14px;line-height:1.6;">${escapeHtml(
        quoted(notice.body),
      )}</div>
      <div style="margin-top:20px;">
        <a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Open the Client tab</a>
      </div>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  await transporter.sendMail({
    from: `"ActiveSet Client Portal" <${gmailUser}>`,
    to: notifyEmail,
    subject,
    html,
  });
  return 'sent';
}

async function sendSlack(notice: ClientMessageNotice, url: string): Promise<'sent' | 'skipped'> {
  if (!readFirstEnv(['SLACK_BOT_TOKEN']) || !readFirstEnv(['SLACK_CHANNEL_ID'])) return 'skipped';

  const heading = `*${who(notice)} replied* — ${notice.projectName}`;
  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: heading } },
    { type: 'section', text: { type: 'mrkdwn', text: `>>> ${quoted(notice.body)}` } },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open the Client tab' },
          url,
        },
      ],
    },
  ];

  await postMessage({ text: `${who(notice)} replied — ${notice.projectName}`, blocks, unfurl_links: false });
  return 'sent';
}

/** Best-effort fan-out. Never throws; logs whatever fails. */
export async function notifyClientMessage(notice: ClientMessageNotice): Promise<void> {
  const url = `${getBaseUrl()}/modules/project-links/${notice.projectId}?tab=client`;

  const results = await Promise.allSettled([sendEmail(notice, url), sendSlack(notice, url)]);
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const channel = i === 0 ? 'email' : 'slack';
      const reason = result.reason instanceof SlackError || result.reason instanceof Error ? result.reason.message : result.reason;
      console.error(`[client-portal] ${channel} notification failed:`, reason);
    }
  });
}
