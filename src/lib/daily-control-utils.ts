import type {
  DailyControlQaResult,
  DailyControlSnapshotStatus,
  ProjectLink,
} from '@/types';

const ACTION_PATTERNS = [
  /\bplease\b/i,
  /\bcan we\b/i,
  /\bcould we\b/i,
  /\bneed(?:s|ed)?\b/i,
  /\bfix(?:ed)?\b/i,
  /\badd(?:ed)?\b/i,
  /\bupdate(?:d)?\b/i,
  /\bremove(?:d)?\b/i,
  /\bchange(?:d)?\b/i,
  /\bcheck\b/i,
  /\breview\b/i,
  /\bqa\b/i,
  /\basap\b/i,
  /\bblock(?:ed|er|ing)?\b/i,
  /\bbroken\b/i,
  /\bpending\b/i,
  /\bwaiting\b/i,
  /\bfollow up\b/i,
  /\bgo live\b/i,
  /\blaunch\b/i,
  /\bready for review\b/i,
];

const CLIENT_INPUT_PATTERNS = [
  /\bwaiting (?:on|for)\b/i,
  /\bneed(?:s|ed)? (?:client|your|their|approval|input|content|copy|assets|images|access|credentials)\b/i,
  /\bplease (?:share|confirm|provide|send)\b/i,
  /\bapproval\b/i,
  /\bclarification\b/i,
];

const BLOCKER_PATTERNS = [
  /\bblocked\b/i,
  /\bblocker\b/i,
  /\bcan't proceed\b/i,
  /\bcannot proceed\b/i,
  /\bnot opening\b/i,
  /\bnot working\b/i,
  /\bbroken\b/i,
  /\bdown\b/i,
  /\bfailed\b/i,
  /\basap\b/i,
  /\burgent\b/i,
  /\bpriority\b/i,
];

export interface OperationalTextClassification {
  isActionable: boolean;
  isBlocker: boolean;
  needsClientInput: boolean;
  confidence: number;
  summary: string;
  pageUrl?: string;
}

export function getDailyControlDateKey(now: Date = new Date(), timeZone?: string): string {
  if (!timeZone) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function buildSlackDedupeKey(channelId: string, messageTs: string): string {
  return `${channelId.trim()}:${messageTs.trim()}`;
}

export function slackRequestDocId(projectId: string, dedupeKey: string): string {
  const safe = `${projectId}:${dedupeKey}`.replace(/[^A-Za-z0-9_-]/g, '_');
  return `slack_${safe.slice(0, 420)}`;
}

export function buildSlackMessageSourceLink(channelId: string, messageTs: string): string {
  const normalizedTs = messageTs.replace('.', '');
  return `https://slack.com/app_redirect?channel=${encodeURIComponent(channelId)}&message_ts=${encodeURIComponent(messageTs)}&p=${encodeURIComponent(normalizedTs)}`;
}

export function extractFirstUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s>|)]+/i);
  return match?.[0];
}

export function cleanSlackText(text: string): string {
  return text
    .replace(/<(@[A-Z0-9]+)\|([^>]+)>/g, '$2')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<!channel>|<!here>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function summarizeText(text: string, maxLength = 160): string {
  const cleaned = cleanSlackText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function redactClientDraftText(text: string): { text: string; redactions: string[] } {
  const redactions = new Set<string>();
  let next = text;
  if (/@activeset\.co/i.test(next)) {
    next = next.replace(/[A-Z0-9._%+-]+@activeset\.co/gi, 'the team');
    redactions.add('Internal ActiveSet email addresses removed.');
  }
  if (/app\.clickup\.com/i.test(next)) {
    next = next.replace(/https?:\/\/app\.clickup\.com\/\S+/gi, 'the internal task');
    redactions.add('Internal ClickUp links removed.');
  }
  return { text: cleanSlackText(next), redactions: Array.from(redactions) };
}

export function classifyOperationalText(rawText: string): OperationalTextClassification {
  const text = cleanSlackText(rawText);
  const actionHits = ACTION_PATTERNS.filter((pattern) => pattern.test(text)).length;
  const isBlocker = BLOCKER_PATTERNS.some((pattern) => pattern.test(text));
  const needsClientInput = CLIENT_INPUT_PATTERNS.some((pattern) => pattern.test(text));
  const hasUrl = Boolean(extractFirstUrl(text));
  const hasList = /(^|\n)\s*(?:[-*\u2022]|\d+[.)])\s+/m.test(rawText);
  const isLongEnough = text.length >= 12;
  const isActionable = isLongEnough && (actionHits > 0 || isBlocker || needsClientInput || (hasUrl && hasList));
  const confidence = Math.min(
    1,
    0.35 + actionHits * 0.12 + (isBlocker ? 0.18 : 0) + (needsClientInput ? 0.12 : 0) + (hasUrl ? 0.08 : 0),
  );

  return {
    isActionable,
    isBlocker,
    needsClientInput,
    confidence: Number(confidence.toFixed(2)),
    summary: summarizeText(text),
    pageUrl: extractFirstUrl(text),
  };
}

export function deriveSnapshotStatus(input: {
  signalCount: number;
  openTaskCount: number;
  blockerCount: number;
  overdueTaskCount: number;
  timelineRiskCount: number;
  qaFailedCount: number;
}): DailyControlSnapshotStatus {
  if (
    input.signalCount === 0 &&
    input.openTaskCount === 0 &&
    input.blockerCount === 0 &&
    input.overdueTaskCount === 0 &&
    input.timelineRiskCount === 0 &&
    input.qaFailedCount === 0
  ) {
    return 'empty';
  }
  if (input.qaFailedCount > 0) return 'qa_failed';
  if (input.blockerCount > 0 || input.overdueTaskCount > 0 || input.timelineRiskCount > 0) {
    return 'blocked';
  }
  if (input.openTaskCount === 0 && input.signalCount === 0) return 'all_clear';
  return 'active';
}

function qaResult(
  id: string,
  label: string,
  severity: DailyControlQaResult['severity'],
  details: string,
  link: ProjectLink,
): DailyControlQaResult {
  return {
    id,
    label,
    status: severity === 'info' ? 'needs_review' : 'failed',
    severity,
    url: link.url,
    details,
    lastRun: link.auditResult?.lastRun,
  };
}

export function collectQaResults(links: ProjectLink[], limit = 12): DailyControlQaResult[] {
  const results: DailyControlQaResult[] = [];

  for (const link of links) {
    const audit = link.auditResult;
    if (!audit) {
      results.push(qaResult(`not-run:${link.id}`, `${link.title || link.url}`, 'info', 'No scan has run yet.', link));
      continue;
    }

    if (audit.changeStatus === 'SCAN_FAILED') {
      results.push(qaResult(`scan-failed:${link.id}`, `${link.title || link.url}`, 'critical', 'Latest scan failed.', link));
    }
    if (audit.canDeploy === false) {
      results.push(qaResult(`deploy-blocked:${link.id}`, `${link.title || link.url}`, 'critical', 'Deployment is blocked by audit findings.', link));
    }
    if (typeof audit.score === 'number' && audit.score < 70) {
      results.push(qaResult(`low-score:${link.id}`, `${link.title || link.url}`, audit.score < 50 ? 'critical' : 'warning', `Audit score is ${audit.score}.`, link));
    }

    const snapshot = audit.contentSnapshot;
    if (snapshot && (!snapshot.title || !snapshot.h1 || !snapshot.metaDescription)) {
      const missing = [
        !snapshot.title ? 'title' : null,
        !snapshot.h1 ? 'H1' : null,
        !snapshot.metaDescription ? 'meta description' : null,
      ].filter(Boolean).join(', ');
      results.push(qaResult(`missing-meta:${link.id}`, `${link.title || link.url}`, 'warning', `Missing ${missing}.`, link));
    }

    const categories = audit.categories as Record<string, unknown> | undefined;
    const linksCategory = categories?.links as { brokenLinks?: unknown[] } | undefined;
    if (Array.isArray(linksCategory?.brokenLinks) && linksCategory.brokenLinks.length > 0) {
      results.push(qaResult(`broken-links:${link.id}`, `${link.title || link.url}`, 'critical', `${linksCategory.brokenLinks.length} broken link(s).`, link));
    }
  }

  return results
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, limit);
}
