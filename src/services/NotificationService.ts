import nodemailer from 'nodemailer';
import { CreateSiteAlertInput, ALERT_TYPE_LABELS } from '@/types/alerts';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface NotificationContext {
  projectId: string;
  projectName: string;
  baseUrl: string;
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
  if (!SLACK_WEBHOOK_URL) {
    console.log('[notifications] Slack webhook not configured, skipping');
    return;
  }

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const warningAlerts = alerts.filter((a) => a.severity === 'warning');
  const projectUrl = `${ctx.baseUrl}/modules/project-links/${ctx.projectId}`;

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

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!response.ok) {
    console.error(`[notifications] Slack webhook failed: ${response.status} ${response.statusText}`);
  } else {
    console.log(`[notifications] Slack notification sent for ${ctx.projectName}`);
  }
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
