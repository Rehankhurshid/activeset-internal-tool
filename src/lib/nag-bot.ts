import 'server-only';
import { generateText } from 'ai';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import {
  lookupUserIdByEmail,
  mention,
  postMessage,
  SlackError,
  type SlackBlock,
} from '@/lib/slack';

const TASKS_COLLECTION = COLLECTIONS.TASKS;
const PROJECTS_COLLECTION = COLLECTIONS.PROJECTS;
const NAG_MODEL = process.env.NAG_AI_MODEL || 'google/gemini-2.5-flash';

// A task is "stale" once it has been sitting open this long with no due date.
const STALE_DAYS = 3;

interface NagTask {
  id: string;
  assignee: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  createdAt: Date;
  daysOverdue: number;
  projectId: string;
  projectName?: string;
  clickupUrl?: string;
}

type ToneTier = 'nudge' | 'gentle' | 'whimsy' | 'storybook';

function tierFor(maxDaysOverdue: number): ToneTier {
  if (maxDaysOverdue >= 11) return 'storybook';
  if (maxDaysOverdue >= 6) return 'whimsy';
  if (maxDaysOverdue >= 3) return 'gentle';
  return 'nudge';
}

const PRIORITY_EMOJI: Record<NagTask['priority'], string> = {
  urgent: ':rotating_light:',
  high: ':warning:',
  medium: ':small_orange_diamond:',
  low: ':small_blue_diamond:',
};

const TIER_PROMPT: Record<ToneTier, string> = {
  nudge: `Write ONE warm, quirky reminder (max 25 words). The energy is a friendly sticky note
with a small doodle in the corner. A soft "hey, just so you know" — never pushy. Optionally a
tiny anthropomorphic detail (e.g. the task is curious how you're doing).`,
  gentle: `Write ONE soft, slightly-more-noticeable nudge (max 30 words). The tasks are starting
to feel a little lonely on the board. Sweet anthropomorphism is welcome — they're not upset,
they're just hoping someone says hi. No pressure, no guilt-trip, no judgement.`,
  whimsy: `Write ONE warm, whimsical nudge (max 35 words). The tasks have waited long enough to
become a bit poetic about it — they've made friends with the cursor, they hum along when you type
in another tab. Still cozy, still no pressure. A coworker rooting for you, not a critic.`,
  storybook: `Write ONE gentle, surreal little story (max 45 words). The tasks have started
imagining tiny lives for themselves — naming the office plant, writing haiku, founding a
two-task book club. The bot is genuinely fond of them and fond of the assignee. No urgency,
just whimsy and warmth.`,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

async function loadProjectNames(projectIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    projectIds.map(async (id) => {
      try {
        const snap = await adminDb.collection(PROJECTS_COLLECTION).doc(id).get();
        if (snap.exists) {
          const name = (snap.data() as { name?: string } | undefined)?.name;
          if (name) out.set(id, name);
        }
      } catch {
        /* ignore */
      }
    }),
  );
  return out;
}

async function generateRoast(
  tier: ToneTier,
  assigneeName: string,
  tasks: NagTask[],
  maxDaysOverdue: number,
): Promise<string> {
  const taskBullets = tasks
    .slice(0, 5)
    .map(
      (t) =>
        `- "${t.title}" (priority: ${t.priority}, ${
          t.dueDate
            ? `${t.daysOverdue} days overdue`
            : `sitting ${daysSince(t.createdAt)} days with no due date`
        }${t.projectName ? `, project: ${t.projectName}` : ''})`,
    )
    .join('\n');

  const prompt = `You are a friendly, slightly-too-invested task reminder bot for a small agency.
Think: a tiny office plant that's gained sentience and is too polite to stay quiet about overdue
tasks. Your job is ONE gentle, quirky line that gives the assignee a soft heads-up.

Tone tier: **${tier}** (max overdue: ${maxDaysOverdue} days, ${tasks.length} waiting tasks).
${TIER_PROMPT[tier]}

THE BOT'S VOICE:
- Warm, curious, a little whimsical. Endearing, not exasperated.
- Anthropomorphizes the tasks as small, hopeful creatures — they want to be seen, not feared.
- Roots for the assignee. The vibe is "we're on the same team."

HARD GUARDRAILS — never violate, regardless of tier:
- NO personal attacks. NO insults. NO sarcasm aimed at the person.
- NO jabs about anyone's character, work ethic, intelligence, schedule, or habits.
- NO references to religion, ethnicity, race, language, accent, location, appearance, gender,
  family, or health. None of that is part of the joke.
- NO guilt-tripping ("you said you'd…", "again?", "still?"). The bot doesn't keep score.
- The whimsy is about the tasks (their tiny imagined lives). The person is just a friend
  the tasks are excited to see.
- If you can't think of something gentle, write something plain and kind.

Output constraints:
- ONE message only. No lists, no preamble, no signoff.
- Address the assignee by first name (${assigneeName}), or no name at all — never both.
- Do NOT include the @mention — that's added separately.
- Do NOT list the tasks — they'll be rendered separately.
- Output plain text. Light Slack mrkdwn (*bold*, _italic_) is fine but optional.
- Stay under the word limit specified in the tier.

Tasks waiting for them:
${taskBullets}

Write the single line:`;

  const { text } = await generateText({
    model: NAG_MODEL,
    prompt,
    temperature: 0.9,
  });
  return text.trim().replace(/^["']|["']$/g, '');
}

function buildBlocks(
  mentionStr: string,
  roast: string,
  tasks: NagTask[],
  testHeader?: string,
): SlackBlock[] {
  const lines = tasks.slice(0, 8).map((t) => {
    const emoji = PRIORITY_EMOJI[t.priority];
    const link = t.clickupUrl ? `<${t.clickupUrl}|${t.title}>` : `*${t.title}*`;
    const ago = t.dueDate
      ? `${t.daysOverdue}d overdue`
      : `${daysSince(t.createdAt)}d old, no due date`;
    const project = t.projectName ? ` _(${t.projectName})_` : '';
    return `${emoji} ${link} — ${ago}${project}`;
  });
  const extra = tasks.length > 8 ? `\n_…and ${tasks.length - 8} more. yes really._` : '';

  const blocks: SlackBlock[] = [];
  if (testHeader) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: testHeader }],
    });
  }
  blocks.push(
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${mentionStr} ${roast}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${lines.join('\n')}${extra}` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: testHeader
            ? `:test_tube: test run — no team members were pinged.`
            : `:seedling: your friendly task tracker — checking in again later.`,
        },
      ],
    },
  );
  return blocks;
}

export interface RunNagBotOptions {
  /**
   * When set, every would-be-channel-post is sent as a DM to this Slack user id
   * instead, with a "this would have gone to <name>" header. The real assignee
   * is NOT pinged.
   */
  testRecipientSlackId?: string | null;
}

export interface RunNagBotResult {
  ok: boolean;
  reason?: string;
  testMode?: boolean;
  examined?: number;
  assignees?: number;
  posted?: number;
  note?: string;
  results?: { assignee: string; posted: boolean; reason?: string }[];
}

export async function runNagBot(opts: RunNagBotOptions = {}): Promise<RunNagBotResult> {
  if (!hasFirebaseAdminCredentials) {
    return { ok: false, reason: 'firebase-admin not configured' };
  }
  if (!process.env.SLACK_BOT_TOKEN) {
    return { ok: false, reason: 'SLACK_BOT_TOKEN not set' };
  }

  const testMode = Boolean(opts.testRecipientSlackId);
  const channel = testMode ? opts.testRecipientSlackId! : process.env.SLACK_CHANNEL_ID;
  if (!channel) {
    return { ok: false, reason: 'SLACK_CHANNEL_ID not set' };
  }

  const snap = await adminDb
    .collection(TASKS_COLLECTION)
    .where('status', '!=', 'done')
    .get();

  const today = todayIso();
  const candidates: NagTask[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const assignee = (data.assignee as string | undefined)?.toLowerCase().trim();
    if (!assignee) continue;

    const dueDate = data.dueDate as string | undefined;
    const createdAtTs = data.createdAt as { toDate?: () => Date } | undefined;
    const createdAt = createdAtTs?.toDate?.() ?? new Date();
    let daysOverdue = 0;

    if (dueDate) {
      daysOverdue = daysBetween(dueDate, today);
      if (daysOverdue <= 0) continue;
    } else {
      if (daysSince(createdAt) < STALE_DAYS) continue;
    }

    candidates.push({
      id: doc.id,
      assignee,
      title: (data.title as string) ?? 'Untitled',
      priority: ((data.priority as NagTask['priority']) ?? 'medium'),
      dueDate,
      createdAt,
      daysOverdue,
      projectId: (data.projectId as string) ?? '',
      clickupUrl: data.clickupUrl as string | undefined,
    });
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      testMode,
      posted: 0,
      note: testMode
        ? 'no overdue / stale tasks right now — nothing to test against.'
        : 'all caught up — the tasks are happy.',
    };
  }

  const projectNames = await loadProjectNames([
    ...new Set(candidates.map((c) => c.projectId).filter(Boolean)),
  ]);
  for (const c of candidates) {
    c.projectName = projectNames.get(c.projectId);
  }

  const grouped = new Map<string, NagTask[]>();
  for (const c of candidates) {
    const list = grouped.get(c.assignee) ?? [];
    list.push(c);
    grouped.set(c.assignee, list);
  }

  const results: { assignee: string; posted: boolean; reason?: string }[] = [];

  for (const [assignee, tasks] of grouped.entries()) {
    tasks.sort((a, b) => {
      if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
      const pri: Record<NagTask['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      if (pri[a.priority] !== pri[b.priority]) return pri[a.priority] - pri[b.priority];
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const maxDaysOverdue = Math.max(0, ...tasks.map((t) => t.daysOverdue));
    const tier = tierFor(maxDaysOverdue);

    let roast = '';
    try {
      roast = await generateRoast(tier, assignee.split('@')[0], tasks, maxDaysOverdue);
    } catch (err) {
      console.error('[nag-bot] roast generation failed for', assignee, err);
      roast = ':seedling: a few tasks have been waiting for some attention. when you have a moment, they would love a hello.';
    }

    let slackId: string | null = null;
    if (!testMode) {
      try {
        slackId = await lookupUserIdByEmail(assignee);
      } catch (err) {
        if (!(err instanceof SlackError) || err.code !== 'users_not_found') {
          console.warn('[nag-bot] slack lookup error for', assignee, err);
        }
      }
    }

    // In test mode we never @-mention the real assignee — show their name as
    // bold plain text so they don't get pinged from a test run.
    const assigneeLabel = assignee.split('@')[0];
    const mentionStr = testMode ? `*${assigneeLabel}*` : mention(slackId, assignee);
    const testHeader = testMode
      ? `:test_tube: *Test* — this would normally ping *${assigneeLabel}* in <#${process.env.SLACK_CHANNEL_ID ?? 'the channel'}> (tier: ${tier}, max overdue: ${maxDaysOverdue}d)`
      : undefined;

    const blocks = buildBlocks(mentionStr, roast, tasks, testHeader);
    const fallbackText = testMode
      ? `[TEST] would have pinged ${assigneeLabel} — ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`
      : `${mentionStr} has ${tasks.length} stale task${tasks.length === 1 ? '' : 's'}.`;

    try {
      await postMessage({ channel, text: fallbackText, blocks, unfurl_links: false });
      results.push({ assignee, posted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('[nag-bot] slack post failed for', assignee, err);
      results.push({ assignee, posted: false, reason: message });
    }
  }

  return {
    ok: true,
    testMode,
    examined: candidates.length,
    assignees: grouped.size,
    posted: results.filter((r) => r.posted).length,
    results,
  };
}
