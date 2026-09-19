import 'server-only';

/**
 * Jev, TypeSafe's System One model, as a typed judgment call.
 *
 * Jev does not generate text. You hand it state and narrow questions, and it
 * returns calibrated probabilities over answers you defined. That is the whole
 * reason it is here: this app's QA already knows how to check whether a title
 * *exists*, and cannot check whether the title is any *good*. One is a string
 * length; the other is a judgment.
 *
 * Hand-rolled over `fetch` rather than pulling in the SDK, for the same reason
 * `src/lib/google-api.ts` hand-rolls Sheets: two endpoints do not justify a
 * dependency in a serverless bundle, and the request shape is three fields.
 *
 * **Without `TYPESAFE_API_KEY` this module answers nothing and says so.** That
 * is not a failure mode, it is the designed one — every caller here already
 * distinguishes "we did not check" from "this failed", so an unconfigured
 * deployment behaves exactly as it did before Jev existed.
 */

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';

/** Judgments are small and fast; a slow one is not worth holding a scan open for. */
const TIMEOUT_MS = 20_000;

export type JevState = Record<string, unknown> | string;

export interface NoulQuestion {
  type: 'noul';
  instructions: string | Record<string, unknown>;
  /** Where the line falls. Optional, but a Noul without it is usually vaguer than intended. */
  criteria?: { true: string; false: string };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string | Record<string, unknown>;
  /** Option key to what belongs in it. `null` for an option whose name says it all. */
  criteria: Record<string, string | Record<string, unknown> | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string | Record<string, unknown>;
  /** Level to the concrete situation it describes. Levels must stand on their own. */
  criteria: Record<string, string>;
}

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: 'noul';
  /** Probability the answer is yes. 0.5 means "could be either", not "medium". */
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities?: Record<string, number>;
  /** How concentrated the distribution is — not a licence to act. */
  confidence?: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface JevResult {
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function hasJevCredentials(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

export class JevUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JevUnavailableError';
  }
}

/**
 * Ask Jev a batch of questions about one piece of state.
 *
 * **Batch aggressively.** Questions in one request run in parallel and cannot
 * see each other's answers, and a second request costs a round trip. Splitting
 * one page's checks across five calls buys nothing and pays five times.
 *
 * Keep the state tight. Accuracy drops as irrelevant content grows, so hand it
 * the title and the copy the question is about, not the whole DOM.
 *
 * Returns `null` when no key is configured, which every caller treats as "not
 * checked" rather than "failed".
 */
export async function askJev(
  state: JevState,
  questions: Record<string, JevQuestion>,
  options: { signal?: AbortSignal } = {},
): Promise<JevResult | null> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  if (Object.keys(questions).length === 0) return { answers: {} };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (options.signal) options.signal.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state, model: MODEL, questions }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // The body carries the useful part — which question was malformed, or
      // that the key is wrong — and a bare status code sends you hunting.
      const detail = await res.text().catch(() => '');
      throw new JevUnavailableError(
        `Jev returned ${res.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`,
      );
    }

    const body = (await res.json()) as JevResult;
    return { answers: body.answers ?? {}, usage: body.usage };
  } catch (error) {
    if (error instanceof JevUnavailableError) throw error;
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new JevUnavailableError(`Jev did not answer within ${TIMEOUT_MS / 1000}s`);
    }
    throw new JevUnavailableError(
      error instanceof Error ? error.message : 'Jev could not be reached',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a Noul, or undefined when the question went unanswered. */
export function noulOf(result: JevResult | null, key: string): number | undefined {
  const answer = result?.answers?.[key];
  if (!answer || answer.type !== 'noul') return undefined;
  return typeof answer.noul === 'number' ? answer.noul : undefined;
}

export function choiceOf(result: JevResult | null, key: string): ChoiceAnswer | undefined {
  const answer = result?.answers?.[key];
  return answer?.type === 'choice' ? answer : undefined;
}

export function scoreOf(result: JevResult | null, key: string): ScoreAnswer | undefined {
  const answer = result?.answers?.[key];
  return answer?.type === 'score' ? answer : undefined;
}
