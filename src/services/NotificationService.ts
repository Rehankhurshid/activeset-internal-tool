import nodemailer from 'nodemailer';
import { CreateSiteAlertInput, ALERT_TYPE_LABELS } from '@/types/alerts';
import { DailyHealthReport, ProjectHealthSummary } from '@/types/health-report';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

interface NotificationContext {
  projectId: string;
  projectName: string;
  baseUrl: string;
}

interface SlackPayload {
  text: string;
  blocks?: Record<string, unknown>[];
}

async function postSlackMessage(payload: SlackPayload): Promise<'sent' | 'skipped'> {
  if (SLACK_WEBHOOK_URL) {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: payload.text,
        blocks: payload.blocks,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
    }

    return 'sent';
  }

  if (SLACK_BOT_TOKEN && SLACK_CHANNEL_ID) {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL_ID,
        text: payload.text,
        blocks: payload.blocks,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { ok?: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`Slack API rejected message: ${data.error || 'unknown_error'}`);
    }

    return 'sent';
  }

  console.log('[notifications] Slack not configured, skipping');
  return 'skipped';
}

/**
 * Send alert digest email for a project's detected anomalies.
 */
async function sendEmailDigest(
  alerts: CreateSiteAlertInput[],
  ctx: NotificationContext
): Promise<void> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_EMAIL) {
    console.log('[notifications] Email not configured, skipping');
    return;
  }

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;
  const projectUrl = `${ctx.baseUrl}/modules/project-links/${ctx.projectId}`;

  const severityLabel = criticalCount > 0 ? 'CRITICAL' : 'WARNING';

  const alertRows = alerts
    .map((alert) => {
      const severityColor = alert.severity === 'critical' ? '#ef4444' : '#f59e0b';
      const pagesHtml = alert.affectedPages
        .slice(0, 5)
        .map(
          (p) =>
            `<li style="margin: 4px 0; font-size: 13px; color: #475569;">${p.title || p.url}${p.detail ? ` — <em>${p.detail}</em>` : ''}</li>`
        )
        .join('');
      const moreCount = alert.affectedPages.length - 5;

      return `
        <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid ${severityColor}; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: white; background: ${severityColor}; text-transform: uppercase;">${alert.severity}</span>
            <span style="font-size: 11px; color: #94a3b8;">${ALERT_TYPE_LABELS[alert.type]}</span>
          </div>
          <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #1e293b;">${alert.title}</h3>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">${alert.message}</p>
          ${alert.affectedPages.length > 0 ? `<ul style="margin: 0; padding-left: 20px;">${pagesHtml}${moreCount > 0 ? `<li style="font-size: 12px; color: #94a3b8;">+${moreCount} more pages</li>` : ''}</ul>` : ''}
        </div>
      `;
    })
    .join('');

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, ${criticalCount > 0 ? '#ef4444' : '#f59e0b'} 0%, ${criticalCount > 0 ? '#dc2626' : '#d97706'} 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Site Alert: ${ctx.projectName}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">
          ${criticalCount > 0 ? `${criticalCount} critical` : ''}${criticalCount > 0 && warningCount > 0 ? ', ' : ''}${warningCount > 0 ? `${warningCount} warning` : ''} alert(s) detected
        </p>
      </div>

      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
        ${alertRows}

        <div style="text-align: center; margin-top: 20px;">
          <a href="${projectUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View Project Dashboard
          </a>
        </div>
      </div>

      <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p>Automated alert from ActiveSet Site Monitor</p>
      </div>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"ActiveSet Alerts" <${GMAIL_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `[${severityLabel}] Site Alert: ${ctx.projectName} — ${alerts.length} issue(s) detected`,
    html: emailHtml,
  });

  console.log(`[notifications] Email sent for ${ctx.projectName} (${alerts.length} alerts)`);
}

/**
 * Send Slack notification via incoming webhook.
 */
async function sendSlackNotification(
  alerts: CreateSiteAlertInput[],
  ctx: NotificationContext
): Promise<void> {
  const summaryText = `${alerts.length} site alert(s) detected for ${ctx.projectName}`;
  const projectUrl = `${ctx.baseUrl}/modules/project-links/${ctx.projectId}`;
  if (!SLACK_WEBHOOK_URL && !(SLACK_BOT_TOKEN && SLACK_CHANNEL_ID)) {
    console.log('[notifications] Slack not configured, skipping');
    return;
  }

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const warningAlerts = alerts.filter((a) => a.severity === 'warning');

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${criticalAlerts.length > 0 ? '🚨' : '⚠️'} Site Alert: ${ctx.projectName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${alerts.length} issue(s) detected* during daily scan\n${criticalAlerts.length > 0 ? `🔴 ${criticalAlerts.length} critical` : ''}${criticalAlerts.length > 0 && warningAlerts.length > 0 ? ' | ' : ''}${warningAlerts.length > 0 ? `🟡 ${warningAlerts.length} warning` : ''}`,
      },
    },
    { type: 'divider' },
  ];

  for (const alert of alerts.slice(0, 5)) {
    const icon = alert.severity === 'critical' ? '🔴' : '🟡';
    const pagesText = alert.affectedPages
      .slice(0, 3)
      .map((p) => `• ${p.title || p.url}${p.detail ? ` — _${p.detail}_` : ''}`)
      .join('\n');
    const moreCount = alert.affectedPages.length - 3;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${icon} *${alert.title}*\n${alert.message}\n${pagesText}${moreCount > 0 ? `\n_+${moreCount} more_` : ''}`,
      },
    });
  }

  if (alerts.length > 5) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_+${alerts.length - 5} more alerts not shown_`,
        },
      ],
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Dashboard', emoji: true },
        url: projectUrl,
        style: 'primary',
      },
    ],
  });

  await postSlackMessage({ text: summaryText, blocks });
  console.log(`[notifications] Slack notification sent for ${ctx.projectName}`);
}

/**
 * Dispatch alerts to all configured channels (Email + Slack).
 */
export async function sendAlertNotifications(
  alerts: CreateSiteAlertInput[],
  ctx: NotificationContext
): Promise<void> {
  if (alerts.length === 0) return;

  const results = await Promise.allSettled([
    sendEmailDigest(alerts, ctx),
    sendSlackNotification(alerts, ctx),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[notifications] Channel failed:', result.reason);
    }
  }
}

// ─── Daily Health Report Notifications ───

function issueRow(label: string, count: number, icon: string): string {
  if (count === 0) return '';
  return `<tr><td style="padding:6px 12px;font-size:13px;color:#64748b;">${icon} ${label}</td><td style="padding:6px 12px;font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${count}</td></tr>`;
}

async function sendHealthReportEmail(report: DailyHealthReport, baseUrl: string): Promise<void> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_EMAIL) return;

  const scoreColor = report.avgScore >= 80 ? '#22c55e' : report.avgScore >= 60 ? '#f59e0b' : '#ef4444';

  const issueRows = [
    issueRow('Missing ALT Text', report.issueBreakdown.missingAltText, '🖼️'),
    issueRow('Missing Meta Description', report.issueBreakdown.missingMetaDescription, '📝'),
    issueRow('Missing Title', report.issueBreakdown.missingTitle, '🏷️'),
    issueRow('Missing H1', report.issueBreakdown.missingH1, '📌'),
    issueRow('Broken Links', report.issueBreakdown.brokenLinks, '🔗'),
    issueRow('Spelling Errors', report.issueBreakdown.spellingErrors, '✏️'),
    issueRow('Missing Open Graph', report.issueBreakdown.missingOpenGraph, '📊'),
    issueRow('Missing Schema', report.issueBreakdown.missingSchema, '🔧'),
    issueRow('Accessibility Errors', report.issueBreakdown.accessibilityErrors, '♿'),
    issueRow('Low Score Pages (<60)', report.issueBreakdown.lowScorePages, '⚠️'),
  ].filter(Boolean).join('');

  const projectRows = report.projects
    .sort((a, b) => a.avgScore - b.avgScore)
    .map(p => {
      const pColor = p.avgScore >= 80 ? '#22c55e' : p.avgScore >= 60 ? '#f59e0b' : '#ef4444';
      const totalIssues = Object.values(p.issues).reduce((a, b) => a + b, 0);
      const topIssues = p.topIssuePages.slice(0, 2).map(pg =>
        `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">• ${pg.title || pg.url} (${pg.score}) — ${pg.issues.slice(0, 2).join(', ')}</div>`
      ).join('');
      return `
        <div style="background:white;border:1px solid #e2e8f0;border-left:4px solid ${pColor};border-radius:8px;padding:14px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong style="font-size:14px;color:#1e293b;">${p.projectName}</strong>
              <span style="font-size:12px;color:#94a3b8;margin-left:8px;">${p.totalPages} pages</span>
            </div>
            <div style="font-size:18px;font-weight:700;color:${pColor};">${p.avgScore}</div>
          </div>
          <div style="font-size:12px;color:#64748b;margin-top:6px;">${totalIssues} issues found</div>
          ${topIssues}
        </div>`;
    }).join('');

  const emailHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:20px;">Daily Site Health Report</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">${report.date} · ${report.projectCount} projects · ${report.totalPages} pages</p>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:48px;font-weight:800;color:${scoreColor};">${report.avgScore}</div>
          <div style="font-size:13px;color:#64748b;">Average Health Score</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${report.totalIssues} total issues across all sites</div>
        </div>
        ${issueRows ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:14px;margin:0 0 8px;color:#1e293b;">Issue Breakdown</h3>
          <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            ${issueRows}
          </table>
        </div>` : ''}
        <div>
          <h3 style="font-size:14px;margin:0 0 8px;color:#1e293b;">Projects</h3>
          ${projectRows}
        </div>
        <div style="text-align:center;margin-top:20px;">
          <a href="${baseUrl}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Dashboard</a>
        </div>
      </div>
      <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;">
        <p>Automated daily report from ActiveSet Site Monitor</p>
      </div>
    </div>`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"ActiveSet Reports" <${GMAIL_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `Daily Health Report — Score: ${report.avgScore} | ${report.totalIssues} issues across ${report.projectCount} sites`,
    html: emailHtml,
  });

  console.log(`[notifications] Health report email sent`);
}

async function sendHealthReportSlack(report: DailyHealthReport, baseUrl: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL && !(SLACK_BOT_TOKEN && SLACK_CHANNEL_ID)) return;

  const scoreEmoji = report.avgScore >= 80 ? '🟢' : report.avgScore >= 60 ? '🟡' : '🔴';

  const issueLines: string[] = [];
  const bd = report.issueBreakdown;
  if (bd.missingAltText > 0) issueLines.push(`🖼️ Missing ALT Text: *${bd.missingAltText}*`);
  if (bd.missingMetaDescription > 0) issueLines.push(`📝 Missing Meta Description: *${bd.missingMetaDescription}*`);
  if (bd.missingTitle > 0) issueLines.push(`🏷️ Missing Title: *${bd.missingTitle}*`);
  if (bd.missingH1 > 0) issueLines.push(`📌 Missing H1: *${bd.missingH1}*`);
  if (bd.brokenLinks > 0) issueLines.push(`🔗 Broken Links: *${bd.brokenLinks}*`);
  if (bd.spellingErrors > 0) issueLines.push(`✏️ Spelling Errors: *${bd.spellingErrors}*`);
  if (bd.missingOpenGraph > 0) issueLines.push(`📊 Missing Open Graph: *${bd.missingOpenGraph}*`);
  if (bd.accessibilityErrors > 0) issueLines.push(`♿ Accessibility Errors: *${bd.accessibilityErrors}*`);
  if (bd.lowScorePages > 0) issueLines.push(`⚠️ Low Score Pages: *${bd.lowScorePages}*`);

  const projectLines = report.projects
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 8)
    .map(p => {
      const e = p.avgScore >= 80 ? '🟢' : p.avgScore >= 60 ? '🟡' : '🔴';
      const totalIssues = Object.values(p.issues).reduce((a, b) => a + b, 0);
      return `${e} *${p.projectName}* — Score: ${p.avgScore} | ${p.totalPages} pages | ${totalIssues} issues`;
    });

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 Daily Site Health Report — ${report.date}`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${scoreEmoji} *Average Score: ${report.avgScore}* | ${report.projectCount} projects | ${report.totalPages} pages | *${report.totalIssues} issues*`,
      },
    },
    { type: 'divider' },
  ];

  if (issueLines.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Issue Breakdown*\n${issueLines.join('\n')}` },
    });
    blocks.push({ type: 'divider' });
  }

  if (projectLines.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Projects*\n${projectLines.join('\n')}` },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Dashboard', emoji: true },
        url: baseUrl,
        style: 'primary',
      },
    ],
  });

  await postSlackMessage({
    text: `Daily site health report for ${report.projectCount} project(s)`,
    blocks,
  });
  console.log(`[notifications] Health report Slack sent`);
}

/**
 * Send daily health report via all channels.
 */
export async function sendHealthReportNotifications(
  report: DailyHealthReport,
  baseUrl: string
): Promise<void> {
  const results = await Promise.allSettled([
    sendHealthReportEmail(report, baseUrl),
    sendHealthReportSlack(report, baseUrl),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[notifications] Health report channel failed:', result.reason);
    }
  }
}

// ─── Per-Project Scan Completion Notification ───

interface ScanCompletionContext {
  projectId: string;
  projectName: string;
  baseUrl: string;
  scannedPages: number;
  totalPages: number;
  summary: { noChange: number; techChange: number; contentChanged: number; failed: number };
}

interface ScanCompletionDeliveryResult {
  slack: 'sent' | 'skipped' | 'failed';
  email: 'sent' | 'skipped' | 'failed';
}

/**
 * Send a per-project notification when a scan completes.
 * Includes health summary with issue counts.
 */
export async function sendScanCompletionNotification(
  ctx: ScanCompletionContext,
  healthSummary: ProjectHealthSummary | null
): Promise<ScanCompletionDeliveryResult> {
  const [slackResult, emailResult] = await Promise.allSettled([
    sendScanCompletionSlack(ctx, healthSummary),
    sendScanCompletionEmail(ctx, healthSummary),
  ]);

  const deliveryResult: ScanCompletionDeliveryResult = {
    slack: slackResult.status === 'fulfilled' ? slackResult.value : 'failed',
    email: emailResult.status === 'fulfilled' ? emailResult.value : 'failed',
  };

  if (slackResult.status === 'rejected') {
    console.error('[notifications] Scan completion Slack failed:', slackResult.reason);
  }

  if (emailResult.status === 'rejected') {
    console.error('[notifications] Scan completion email failed:', emailResult.reason);
  }

  if (deliveryResult.slack === 'failed' && deliveryResult.email === 'failed') {
    throw new Error('All scan completion notification channels failed');
  }

  return deliveryResult;
}

async function sendScanCompletionSlack(
  ctx: ScanCompletionContext,
  health: ProjectHealthSummary | null
): Promise<'sent' | 'skipped'> {
  if (!SLACK_WEBHOOK_URL && !(SLACK_BOT_TOKEN && SLACK_CHANNEL_ID)) return 'skipped';

  const { summary } = ctx;
  const scoreEmoji = health
    ? health.avgScore >= 80 ? '🟢' : health.avgScore >= 60 ? '🟡' : '🔴'
    : '⚪';

  const changesSummary = [
    summary.contentChanged > 0 ? `${summary.contentChanged} content changed` : null,
    summary.techChange > 0 ? `${summary.techChange} tech-only` : null,
    summary.noChange > 0 ? `${summary.noChange} unchanged` : null,
    summary.failed > 0 ? `${summary.failed} failed` : null,
  ].filter(Boolean).join(' · ');

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `✅ Scan Complete: ${ctx.projectName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${scoreEmoji} *Score: ${health?.avgScore ?? '—'}* | ${ctx.scannedPages}/${ctx.totalPages} pages scanned\n${changesSummary}`,
      },
    },
  ];

  if (health) {
    const issueLines: string[] = [];
    const i = health.issues;
    if (i.missingAltText > 0) issueLines.push(`🖼️ Missing ALT: *${i.missingAltText}*`);
    if (i.missingMetaDescription > 0) issueLines.push(`📝 Missing Meta Desc: *${i.missingMetaDescription}*`);
    if (i.missingTitle > 0) issueLines.push(`🏷️ Missing Title: *${i.missingTitle}*`);
    if (i.missingH1 > 0) issueLines.push(`📌 Missing H1: *${i.missingH1}*`);
    if (i.brokenLinks > 0) issueLines.push(`🔗 Broken Links: *${i.brokenLinks}*`);
    if (i.spellingErrors > 0) issueLines.push(`✏️ Spelling: *${i.spellingErrors}*`);
    if (i.accessibilityErrors > 0) issueLines.push(`♿ Accessibility: *${i.accessibilityErrors}*`);
    if (i.lowScorePages > 0) issueLines.push(`⚠️ Low Score Pages: *${i.lowScorePages}*`);

    if (issueLines.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: issueLines.join('\n') },
      });
    }

    if (health.topIssuePages.length > 0) {
      const worstPages = health.topIssuePages.slice(0, 3).map(
        p => `• *${p.title || p.url}* (${p.score}) — ${p.issues.slice(0, 2).join(', ')}`
      ).join('\n');
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `*Worst pages:*\n${worstPages}` }],
      });
    }
  }

  const projectUrl = `${ctx.baseUrl}/modules/project-links/${ctx.projectId}`;
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Project', emoji: true },
        url: projectUrl,
        style: 'primary',
      },
    ],
  });

  await postSlackMessage({
    text: `Scan complete for ${ctx.projectName}: ${ctx.scannedPages}/${ctx.totalPages} pages scanned`,
    blocks,
  });

  console.log(`[notifications] Scan completion Slack sent for ${ctx.projectName}`);
  return 'sent';
}

async function sendScanCompletionEmail(
  ctx: ScanCompletionContext,
  health: ProjectHealthSummary | null
): Promise<'sent' | 'skipped'> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_EMAIL) return 'skipped';

  const { summary } = ctx;
  const scoreColor = health
    ? health.avgScore >= 80 ? '#22c55e' : health.avgScore >= 60 ? '#f59e0b' : '#ef4444'
    : '#94a3b8';

  const totalIssues = health ? Object.values(health.issues).reduce((a, b) => a + b, 0) : 0;

  const issueRows = health ? [
    issueRow('Missing ALT Text', health.issues.missingAltText, '🖼️'),
    issueRow('Missing Meta Description', health.issues.missingMetaDescription, '📝'),
    issueRow('Missing Title', health.issues.missingTitle, '🏷️'),
    issueRow('Missing H1', health.issues.missingH1, '📌'),
    issueRow('Broken Links', health.issues.brokenLinks, '🔗'),
    issueRow('Spelling Errors', health.issues.spellingErrors, '✏️'),
    issueRow('Accessibility', health.issues.accessibilityErrors, '♿'),
    issueRow('Low Score Pages', health.issues.lowScorePages, '⚠️'),
  ].filter(Boolean).join('') : '';

  const projectUrl = `${ctx.baseUrl}/modules/project-links/${ctx.projectId}`;

  const emailHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,${scoreColor} 0%,${scoreColor}dd 100%);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:20px;">Scan Complete: ${ctx.projectName}</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">
          ${ctx.scannedPages}/${ctx.totalPages} pages · Score: ${health?.avgScore ?? '—'}
        </p>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;">
        <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:16px;">
          <div><div style="font-size:20px;font-weight:700;color:#22c55e;">${summary.noChange}</div><div style="font-size:11px;color:#64748b;">Unchanged</div></div>
          <div><div style="font-size:20px;font-weight:700;color:#3b82f6;">${summary.techChange}</div><div style="font-size:11px;color:#64748b;">Tech Only</div></div>
          <div><div style="font-size:20px;font-weight:700;color:#f59e0b;">${summary.contentChanged}</div><div style="font-size:11px;color:#64748b;">Content Changed</div></div>
          <div><div style="font-size:20px;font-weight:700;color:#ef4444;">${summary.failed}</div><div style="font-size:11px;color:#64748b;">Failed</div></div>
        </div>
        ${totalIssues > 0 ? `
        <h3 style="font-size:14px;margin:16px 0 8px;color:#1e293b;">${totalIssues} Issues Found</h3>
        <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          ${issueRows}
        </table>` : '<p style="text-align:center;color:#22c55e;font-weight:600;">No issues found!</p>'}
        <div style="text-align:center;margin-top:20px;">
          <a href="${projectUrl}" style="display:inline-block;background:#3b82f6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Project</a>
        </div>
      </div>
      <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;">Automated scan report from ActiveSet</div>
    </div>`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"ActiveSet Scans" <${GMAIL_USER}>`,
    to: NOTIFY_EMAIL,
    subject: `Scan Complete: ${ctx.projectName} — Score: ${health?.avgScore ?? '—'} | ${totalIssues} issues`,
    html: emailHtml,
  });

  console.log(`[notifications] Scan completion email sent for ${ctx.projectName}`);
  return 'sent';
}
