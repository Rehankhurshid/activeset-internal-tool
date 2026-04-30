import 'server-only';

const SLACK_API_BASE = 'https://slack.com/api';

export class SlackError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'SlackError';
  }
}

function getBotToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new SlackError('SLACK_BOT_TOKEN is not configured', 'no_token');
  }
  return token;
}

async function slackPost<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getBotToken()}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await res.json()) as { ok?: boolean; error?: string } & T;
  if (!json.ok) {
    throw new SlackError(`slack.${method} failed: ${json.error}`, json.error);
  }
  return json;
}

async function slackGet<T>(method: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getBotToken()}` },
    cache: 'no-store',
  });
  const json = (await res.json()) as { ok?: boolean; error?: string } & T;
  if (!json.ok) {
    throw new SlackError(`slack.${method} failed: ${json.error}`, json.error);
  }
  return json;
}

// Email → Slack user id, cached for the lifetime of the lambda invocation.
const userIdCache = new Map<string, string | null>();

/**
 * Look up a Slack user by email. Returns the Slack user id (e.g. "U01ABC2DEF")
 * or null if no Slack account matches that email.
 *
 * Requires the `users:read.email` scope on the bot token.
 */
export async function lookupUserIdByEmail(email: string): Promise<string | null> {
  const key = email.toLowerCase().trim();
  if (!key) return null;
  if (userIdCache.has(key)) return userIdCache.get(key) ?? null;
  try {
    const res = await slackGet<{ user?: { id: string } }>('users.lookupByEmail', {
      email: key,
    });
    const id = res.user?.id ?? null;
    userIdCache.set(key, id);
    return id;
  } catch (err) {
    // users_not_found is expected for collaborators not in the Slack workspace —
    // cache the miss so repeated nag runs don't retry.
    if (err instanceof SlackError && err.code === 'users_not_found') {
      userIdCache.set(key, null);
      return null;
    }
    throw err;
  }
}

export interface SlackBlock {
  type: string;
  [k: string]: unknown;
}

export interface PostMessageOptions {
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
  unfurl_links?: boolean;
  thread_ts?: string;
}

export async function postMessage(opts: PostMessageOptions): Promise<{ ts: string }> {
  const channel = opts.channel || process.env.SLACK_CHANNEL_ID;
  if (!channel) throw new SlackError('No Slack channel id configured', 'no_channel');
  const res = await slackPost<{ ts: string }>('chat.postMessage', {
    channel,
    text: opts.text,
    ...(opts.blocks ? { blocks: opts.blocks } : {}),
    ...(opts.unfurl_links === false ? { unfurl_links: false } : {}),
    ...(opts.thread_ts ? { thread_ts: opts.thread_ts } : {}),
  });
  return { ts: res.ts };
}

/** Slack mention syntax: <@U123>. Falls back to @username text if id is null. */
export function mention(userId: string | null, fallback: string): string {
  if (userId) return `<@${userId}>`;
  return `@${fallback.split('@')[0]}`;
}
