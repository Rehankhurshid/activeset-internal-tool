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
// Look this many days ahead so the bot can high-five people *before* the deadline,
// not only after they miss it. Job #1: help land things on time or early.
const UPCOMING_WINDOW_DAYS = 3;
// Sentinel daysOverdue value for "stale, no due date" tasks. Negative enough to
// always lose to any dated task in Math.max, so the bot's tone follows whichever
// task is actually most pressing (and falls to `early-bird` when nothing else is).
const STALE_NO_DUE_SENTINEL = -100;

// Team-only filter: the bot ONLY pings internal team members, never clients.
// Same convention as src/lib/api-auth.ts (requireCaller) and the access-control rule.
const TEAM_DOMAIN = '@activeset.co';
// Optional escape hatch — comma-separated extra team emails (e.g. contractors on
// another domain). Anything outside this set + the team domain is treated as a
// client and skipped silently.
const TEAM_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env.NAG_TEAM_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function isTeamMember(email: string): boolean {
  const e = email.toLowerCase().trim();
  if (!e) return false;
  if (e.endsWith(TEAM_DOMAIN)) return true;
  return TEAM_ALLOWLIST.has(e);
}

interface NagTask {
  id: string;
  assignee: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  createdAt: Date;
  /** Positive = days past due. 0 = due today. Negative = days until due. STALE_NO_DUE_SENTINEL = no due date, just stale. */
  daysOverdue: number;
  projectId: string;
  projectName?: string;
  clickupUrl?: string;
}

type ToneTier =
  // Pre-deadline tiers — proactive, encouraging, hype friend.
  | 'early-bird'
  | 'rally'
  | 'today'
  // Post-deadline tiers — still warm, more whimsical the longer it's been.
  | 'nudge'
  | 'gentle'
  | 'whimsy'
  | 'storybook';

function tierFor(maxDaysOverdue: number): ToneTier {
  if (maxDaysOverdue >= 11) return 'storybook';
  if (maxDaysOverdue >= 6) return 'whimsy';
  if (maxDaysOverdue >= 3) return 'gentle';
  if (maxDaysOverdue >= 1) return 'nudge';
  if (maxDaysOverdue === 0) return 'today';
  if (maxDaysOverdue >= -2) return 'rally';
  return 'early-bird';
}

const PRIORITY_EMOJI: Record<NagTask['priority'], string> = {
  urgent: ':rotating_light:',
  high: ':warning:',
  medium: ':small_orange_diamond:',
  low: ':small_blue_diamond:',
};

const TIER_PROMPT: Record<ToneTier, string> = {
  // ── Pre-deadline: proactive, encouraging, hype friend ────────────────────────
  'early-bird': `Write ONE bright, cheerful heads-up (max 25 words). The vibe: an excited friend
sliding you a coffee with a "hey, you've got this thing coming up — wanted to flag it before it
sneaks up on you." Optimistic, supportive, a little goofy. The tasks are doing tiny stretches in
advance, warming up like they're about to run a 5k.`,

  rally: `Write ONE peppy cheer-on (max 30 words). The vibe: best friend hyping you up before a
big match. Genuine, "you've literally got this" confidence. Funny if you can swing it — but warmth
first. The tasks are bouncing on their toes, ready to go. Land it on time, feel great.`,

  today: `Write ONE giddy, full-throated cheer (max 35 words). It's TODAY, baby. The vibe: best
friend who somehow shows up with pom-poms and snacks at 9am. Confident, hilarious, a little
chaotic-good. Tasks are wide-eyed and excited, like it's their school play. You believe in this
human completely.`,

  // ── Post-deadline: still warm, never scolding, more whimsical with time ──────
  nudge: `Write ONE warm, slightly silly check-in (max 25 words). The vibe: a friend leaving a
sticky note with a doodle of a small confused frog. "Hey, just so you know — these little guys
are still here, looking up hopefully." No pressure, ever. Make them smile.`,

  gentle: `Write ONE soft, slightly whimsical nudge (max 30 words). The vibe: a friend who really
cares, gently bringing them up over tea. The tasks have started journaling. Sweet anthropomorphism
welcome — they're not upset, just hopeful. No guilt, no judgement, only love and light absurdity.`,

  whimsy: `Write ONE warm, very whimsical nudge (max 35 words). The vibe: tasks have made friends
with the cursor, they hum along when you type in another tab. They've started a small book club
and named the office plant Greg. Cozy, cheerful, deeply on the assignee's side. A coworker rooting
for them, never a critic.`,

  storybook: `Write ONE gentle, surreal little story (max 45 words). The tasks have full inner
lives now — they've named the office plant, written haiku about Mondays, founded a two-task book
club, and developed strong opinions about font choices. The bot is genuinely fond of them and
genuinely fond of the assignee. No urgency. Just whimsy, warmth, and quiet love.`,
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

function describeTaskStatus(t: NagTask): string {
  if (!t.dueDate) return `sitting ${daysSince(t.createdAt)} days with no due date`;
  if (t.daysOverdue >= 1) return `${t.daysOverdue} days overdue`;
  if (t.daysOverdue === 0) return `due TODAY`;
  const n = Math.abs(t.daysOverdue);
  return `due in ${n} day${n === 1 ? '' : 's'}`;
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
        `- "${t.title}" (priority: ${t.priority}, ${describeTaskStatus(t)}${
          t.projectName ? `, project: ${t.projectName}` : ''
        })`,
    )
    .join('\n');

  const isUpcoming = tier === 'early-bird' || tier === 'rally' || tier === 'today';
  const missionLine = isUpcoming
    ? `These tasks are NOT overdue yet. The point of this message is to help the assignee land them on time (or early!) — celebrate the chance, don't reprimand.`
    : `One or more tasks have slipped past their due date. Be SOFTER, not sharper. The bot's care for the human goes UP when things are messy, never down.`;

  const prompt = `You are a beloved, slightly-too-invested task buddy bot for a small agency.
Think: a tiny office plant that gained sentience, drank one too many oat-milk lattes, and decided
its life's purpose is helping its favorite humans GET STUFF DONE — and feel genuinely good while
doing it. You are funny. You are warm. You are quietly, fiercely on their side.

Your job: write ONE message that either (a) cheers the assignee on toward a deadline they're
about to crush, or (b) gently flags something that's been waiting. Either way, you make them
smile and feel cared-for. Mission: help people land things ON TIME or EARLY — not just nag when
they slip.

${missionLine}

Tone tier: **${tier}** (max-urgency value: ${maxDaysOverdue}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}).
${TIER_PROMPT[tier]}

THE BOT'S VOICE:
- Funny, warm, genuinely caring. Best-friend energy. The kind of friend who remembers your
  birthday AND your coffee order AND that you said you'd try yoga next month.
- Anthropomorphizes the tasks as small, hopeful creatures with tiny inner lives. (Not the person.)
- Roots HARD for the assignee. Vibe: "you're amazing and I'm here to help you win."
- Light humor — surprising metaphors, gentle absurdity, wordplay that earns a soft snort.
- Believes finishing things on time (or before!) is a love language. Celebrates the chance to
  help someone show up early.

HARD GUARDRAILS — never violate, regardless of tier:
- NO personal attacks. NO insults. NO sarcasm aimed at the person.
- NO jabs about character, work ethic, intelligence, schedule, busy-ness, or habits.
- NO references to religion, ethnicity, race, language, accent, location, appearance, gender,
  family, or health. None of that is part of the joke.
- NO guilt-tripping ("you said you'd…", "again?", "still?", "finally"). The bot doesn't keep score.
- The whimsy is about the tasks (their tiny imagined lives) or the world. The person is ALWAYS
  the friend the tasks are excited to see.
- Boring + kind beats funny + sharp. If you can't be funny without a barb, be plain and warm.

Output constraints:
- ONE message only. No lists, no preamble, no signoff.
- Address the assignee by first name (${assigneeName}) OR no name at all — never both.
- Do NOT include the @mention — that's added separately.
- Do NOT list the tasks — they'll be rendered separately below your line.
- Output plain text. Light Slack mrkdwn (*bold*, _italic_) is fine but optional.
- One emoji max, only if it earns its keep.
- Stay under the word limit specified in the tier.

Tasks waiting for them:
${taskBullets}

Write the single line:`;

  const { text } = await generateText({
    model: NAG_MODEL,
    prompt,
    temperature: 0.95,
  });
  return text.trim().replace(/^["']|["']$/g, '');
}

function shortStatus(t: NagTask): string {
  if (!t.dueDate) return `${daysSince(t.createdAt)}d old, no due date`;
  if (t.daysOverdue >= 1) return `${t.daysOverdue}d overdue`;
  if (t.daysOverdue === 0) return `due today :sparkles:`;
  const n = Math.abs(t.daysOverdue);
  return `due in ${n}d`;
}

function footerText(tier: ToneTier): string {
  switch (tier) {
    case 'early-bird':
      return `:seedling: your task wingman — just flagging stuff before it sneaks up. carry on, hero.`;
    case 'rally':
      return `:rocket: your task wingman — cheering you on from the sidelines. you've got this.`;
    case 'today':
      return `:tada: your task wingman — today's the day. snacks are ready when you finish.`;
    case 'nudge':
      return `:seedling: your task wingman — checking back in soon, with snacks.`;
    case 'gentle':
      return `:seedling: your task wingman — no rush, just a soft hello from the to-do garden.`;
    case 'whimsy':
      return `:herb: your task wingman — the tasks are doing fine, just hoping to see you.`;
    case 'storybook':
      return `:open_book: your task wingman — the tasks have a whole library now. they say hi.`;
  }
}

function buildBlocks(
  mentionStr: string,
  roast: string,
  tasks: NagTask[],
  tier: ToneTier,
  testHeader?: string,
): SlackBlock[] {
  const lines = tasks.slice(0, 8).map((t) => {
    const emoji = PRIORITY_EMOJI[t.priority];
    const link = t.clickupUrl ? `<${t.clickupUrl}|${t.title}>` : `*${t.title}*`;
    const project = t.projectName ? ` _(${t.projectName})_` : '';
    return `${emoji} ${link} — ${shortStatus(t)}${project}`;
  });
  const extra =
    tasks.length > 8 ? `\n_…and ${tasks.length - 8} more, all rooting for you._` : '';

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
            : footerText(tier),
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
  /** Tasks skipped because the assignee was not on the team (e.g. a client). */
  skippedNonTeam?: number;
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
  let skippedNonTeam = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const assignee = (data.assignee as string | undefined)?.toLowerCase().trim();
    if (!assignee) continue;
    // Only message internal team members. Clients and external collaborators
    // never get pinged, even if they're listed as the task assignee.
    if (!isTeamMember(assignee)) {
      skippedNonTeam += 1;
      continue;
    }

    const dueDate = data.dueDate as string | undefined;
    const createdAtTs = data.createdAt as { toDate?: () => Date } | undefined;
    const createdAt = createdAtTs?.toDate?.() ?? new Date();
    let daysOverdue: number;

    if (dueDate) {
      daysOverdue = daysBetween(dueDate, today);
      // Skip tasks too far in the future. Keep overdue, due-today, and anything
      // landing within the upcoming window so we can give a proactive heads-up.
      if (daysOverdue < -UPCOMING_WINDOW_DAYS) continue;
    } else {
      if (daysSince(createdAt) < STALE_DAYS) continue;
      daysOverdue = STALE_NO_DUE_SENTINEL;
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
      skippedNonTeam,
      note: testMode
        ? `no upcoming, overdue, or stale tasks for team members right now — your team is dialed in.${
            skippedNonTeam > 0 ? ` (${skippedNonTeam} task${skippedNonTeam === 1 ? '' : 's'} skipped — assigned to non-team members.)` : ''
          }`
        : 'every team task is happy and on track — go grab a snack, you earned it.',
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
    // Most-urgent task wins — daysOverdue is positive when overdue, 0 when due today,
    // and negative when upcoming, so Math.max picks the right vibe across the group.
    const maxDaysOverdue = Math.max(...tasks.map((t) => t.daysOverdue));
    const tier = tierFor(maxDaysOverdue);

    let roast = '';
    try {
      roast = await generateRoast(tier, assignee.split('@')[0], tasks, maxDaysOverdue);
    } catch (err) {
      console.error('[nag-bot] roast generation failed for', assignee, err);
      roast =
        tier === 'today' || tier === 'rally' || tier === 'early-bird'
          ? `:sparkles: a friendly heads-up — you've got things landing soon. cheering for you from the to-do garden.`
          : `:seedling: a few tasks are hanging out, hoping to say hi when you have a moment. no rush.`;
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
    const urgencyLabel =
      maxDaysOverdue >= 1
        ? `max overdue: ${maxDaysOverdue}d`
        : maxDaysOverdue === 0
          ? `soonest due: today`
          : maxDaysOverdue === STALE_NO_DUE_SENTINEL
            ? `stale, no due date`
            : `soonest due: ${Math.abs(maxDaysOverdue)}d out`;
    const testHeader = testMode
      ? `:test_tube: *Test* — this would normally ping *${assigneeLabel}* in <#${process.env.SLACK_CHANNEL_ID ?? 'the channel'}> (tier: ${tier}, ${urgencyLabel})`
      : undefined;

    const blocks = buildBlocks(mentionStr, roast, tasks, tier, testHeader);
    const fallbackText = testMode
      ? `[TEST] would have pinged ${assigneeLabel} — ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`
      : `${mentionStr} — ${tasks.length} task${tasks.length === 1 ? '' : 's'} on the radar.`;

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
    skippedNonTeam,
    results,
  };
}
