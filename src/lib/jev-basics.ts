import 'server-only';
import { askJev, noulOf, type JevQuestion } from '@/lib/jev';
import { JEV_THRESHOLDS } from '@/lib/jev-qa';
import type { BasicsGap, MissingBasic } from '@/modules/delivery/domain/delivery.basics';

/**
 * Deciding whether a project already does a standard step, properly.
 *
 * `basicsGap` finds candidates by counting shared words, which is the wrong
 * instrument for the question being asked. It has to decide whether "Create
 * Slack Channel with Client. Workflow: Setup Channel" and "Create the shared
 * Slack channel with the client" are the same piece of work, and word overlap
 * cannot tell that apart from "Schedule the kickoff call" against "Hold the
 * kickoff call", which are two different steps and one of them gates the
 * project. That near-miss already cost a bug earlier.
 *
 * So code keeps the job it is good at — finding plausible candidates cheaply
 * across every step on the project — and Jev makes the call on each pair. Two
 * short titles, one narrow question, no counting and no lists: squarely inside
 * what a System One model is reliable at.
 *
 * Without a key this returns the gap untouched, so the word-overlap result
 * stands and the feature behaves exactly as it did before.
 */

/**
 * How wide code casts the net before Jev judges.
 *
 * Deliberately below the threshold `basicsGap` uses on its own. Cheap recall
 * here and precision from the model is the whole point; a candidate that is
 * never put to Jev is a duplicate step somebody has to delete by hand.
 */
const CANDIDATE_AT = 0.25;

/** Candidates per step. More than this is mostly noise and tokens. */
const MAX_CANDIDATES = 3;

function normalize(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const NOISE = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'with', 'from', 'on', 'in',
  'at', 'by', 'as', 'is', 'it', 'this', 'that', 'client', 'project', 'we', 'our',
]);

function keywords(title: string): Set<string> {
  return new Set(normalize(title).split(' ').filter((w) => w.length > 2 && !NOISE.has(w)));
}

/** The same cheap overlap `basicsGap` uses, here only to shortlist. */
function overlap(a: string, b: string): number {
  const left = keywords(a);
  const right = keywords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

function shortlist(missing: MissingBasic, existing: string[]): string[] {
  return existing
    .map((title) => ({ title, score: overlap(missing.item.title, title) }))
    .filter((row) => row.score >= CANDIDATE_AT)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((row) => row.title);
}

/**
 * Re-judge every resemblance in a gap with Jev.
 *
 * One request. The pairs are independent, they share no state, and a second
 * round trip would buy nothing — so every pair goes in the same batch.
 */
export async function refineBasicsGap(
  gap: BasicsGap,
  existingTitles: string[],
): Promise<BasicsGap> {
  if (gap.missing.length === 0 || existingTitles.length === 0) return gap;

  const pairs: { key: string; missingKey: string; candidate: string }[] = [];
  const questions: Record<string, JevQuestion> = {};

  for (const missing of gap.missing) {
    for (const candidate of shortlist(missing, existingTitles)) {
      const key = `pair_${pairs.length}`;
      pairs.push({ key, missingKey: missing.key, candidate });
      questions[key] = {
        type: 'noul',
        instructions: {
          question: `Do \`pairs.${key}.standard\` and \`pairs.${key}.existing\` describe the same piece of work?`,
          focus:
            'Two project checklist steps, worded by different people. Judge the work each one asks for, not the words used.',
        },
        criteria: {
          true: 'Doing one would mean the other is also done. Having both on a checklist would be a duplicate.',
          false: 'Related but separate work, or two stages of the same thing — booking a call and running it, setting something up and checking it afterwards. Both belong on the checklist.',
        },
      };
    }
  }

  if (pairs.length === 0) return gap;

  const state = {
    pairs: Object.fromEntries(
      pairs.map((pair) => {
        const missing = gap.missing.find((m) => m.key === pair.missingKey);
        return [pair.key, { standard: missing?.item.title ?? '', existing: pair.candidate }];
      }),
    ),
  };

  const result = await askJev(state, questions);
  if (!result) return gap;

  // Best answered pair per step wins; a step with no confident match comes back
  // with its resemblance cleared, which is the point — the word-overlap version
  // flagged things that merely shared vocabulary.
  const best = new Map<string, { candidate: string; probability: number }>();
  for (const pair of pairs) {
    const probability = noulOf(result, pair.key);
    if (probability === undefined) continue;
    const current = best.get(pair.missingKey);
    if (!current || probability > current.probability) {
      best.set(pair.missingKey, { candidate: pair.candidate, probability });
    }
  }

  /** Drops the word-overlap guess rather than leaving a claim Jev did not make. */
  const withoutGuess = (missing: MissingBasic): MissingBasic => {
    const next = { ...missing };
    delete next.resembles;
    delete next.likelyDuplicate;
    return next;
  };

  return {
    ...gap,
    missing: gap.missing.map((missing) => {
      const match = best.get(missing.key);
      // Nothing was put to Jev for this step, or nothing came back. Leaving the
      // cheap guess in place would be worse than saying nothing.
      if (!match) return withoutGuess(missing);
      if (match.probability <= JEV_THRESHOLDS.fail) return withoutGuess(missing);

      return {
        ...missing,
        resembles: match.candidate,
        // Only a confident yes starts a step unticked. Missing a standard step
        // is invisible; a duplicate takes two seconds to delete.
        ...(match.probability >= JEV_THRESHOLDS.pass ? { likelyDuplicate: true as const } : {}),
      };
    }),
  };
}
