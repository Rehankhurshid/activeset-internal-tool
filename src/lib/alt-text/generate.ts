import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import { cacheKey, digestContext, readCache, writeCache } from './cache';
import { generateJson, resolveOllama, type OllamaOptions } from './ollama';
import { prepareImage, type PrepareOptions } from './prepare';
import {
  ALWAYS_REVIEW_KINDS,
  PROMPT_VERSION,
  judgmentSchema,
  systemPrompt,
  userPrompt,
} from './taxonomy';
import { validateJudgment, altForRecordPortrait } from './validate';
import { ALT_KINDS, type AltKind, type AltSuggestion, type ImageContext, type RawJudgment } from './types';

/**
 * The pipeline, in the order it runs:
 *
 *   fetch and shrink  →  cheap rules  →  one schema-constrained model call
 *   →  deterministic repair  →  optional agreement and self-check
 *
 * Every stage that can be settled without the model is settled without it,
 * and every rule that can be enforced in code is enforced in code. What is
 * left for the model is the part only looking at the picture can answer.
 */

export interface GenerateOptions extends OllamaOptions, PrepareOptions {
  /**
   * Sample the classification this many times and keep the majority, with the
   * agreement rate as a real confidence. Costs a call per sample. Three is
   * enough to catch a model flip-flopping between "decorative" and "logo".
   */
  consensus?: number;
  /** Show the model its own answer and ask whether it holds. Catches confident nonsense. */
  verify?: boolean;
  /** Ignore the cache and re-ask. */
  noCache?: boolean;
  /** Treat anything below this as needing review. */
  reviewBelow?: 'high' | 'medium';
}

const CERTAINTY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function contextDigest(context: ImageContext): string {
  return digestContext({
    heading: context.heading,
    caption: context.caption,
    title: context.title,
    nearbyText: context.nearbyText,
    linkHref: context.linkHref,
    linkText: context.linkText,
    region: context.region,
    className: context.className,
    pageTitle: context.pageTitle,
    siteName: context.siteName,
    presentational: context.markedPresentational,
    // In the key so that the old CMS drafts, made when the item's name only
    // arrived as a loose hint, are not simply replayed from cache.
    subject: context.subject,
  });
}

/** Pick the category most samples agreed on; ties go to the most certain sample. */
function majority(samples: RawJudgment[]): { winner: RawJudgment; agreement: number } {
  const counts = new Map<AltKind, RawJudgment[]>();
  for (const sample of samples) {
    const list = counts.get(sample.kind) ?? [];
    list.push(sample);
    counts.set(sample.kind, list);
  }
  let best: RawJudgment[] = [];
  for (const list of counts.values()) {
    if (list.length > best.length) best = list;
  }
  const winner = [...best].sort(
    (a, b) => (CERTAINTY_RANK[b.certainty] ?? 0) - (CERTAINTY_RANK[a.certainty] ?? 0),
  )[0];
  return { winner, agreement: best.length / samples.length };
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    accurate: { type: 'boolean' },
    problem: { type: 'string' },
  },
  required: ['accurate', 'problem'],
};

async function verifyAlt(
  base64: string,
  alt: string,
  options: OllamaOptions,
): Promise<{ accurate: boolean; problem: string }> {
  const { value } = await generateJson<{ accurate: boolean; problem: string }>(
    {
      system:
        'You check alt text against the image it describes. Answer only whether the text is accurate for what is actually visible. A short, plain description that leaves out detail is still accurate. A description that states something not in the image is not.',
      prompt: `Proposed alt text: "${alt}"\n\nIs this accurate for this image? If not, say in one clause what is wrong.`,
      images: [base64],
      schema: VERIFY_SCHEMA,
      temperature: 0,
      maxTokens: 120,
    },
    options,
  );
  return value;
}

export async function generateAltText(
  context: ImageContext,
  options: GenerateOptions = {},
): Promise<AltSuggestion> {
  const startedAt = Date.now();
  const { model } = resolveOllama(options);
  const fingerprint = imageFingerprint(context.src);

  const prepared = await prepareImage(context, options);

  const key = cacheKey({
    sha256: prepared.sha256,
    model,
    promptVersion: PROMPT_VERSION,
    contextDigest: contextDigest(context),
  });

  if (!options.noCache) {
    const hit = await readCache(key);
    // The cache is keyed by the image's bytes and its context, not by where it
    // lives — so one upload used in two CMS fields ("Thumbnail — Regular" and
    // "Thumbnail — Main Image") is one cache entry. The answer can be shared;
    // its identity cannot. Returning the hit as stored filed the second
    // field's draft under the first field's address, and the second field
    // never got ALT.
    if (hit) return { ...hit, fingerprint, src: context.src, cached: true, durationMs: Date.now() - startedAt };
  }

  const finish = async (suggestion: AltSuggestion): Promise<AltSuggestion> => {
    await writeCache(key, { ...suggestion, cached: false });
    return suggestion;
  };

  // Settled by the cheap rules: no model call at all.
  if (prepared.precheck) {
    return finish({
      fingerprint,
      src: context.src,
      kind: prepared.precheck.kind,
      certainty: prepared.precheck.certainty,
      alt: '',
      observation: prepared.precheck.reason,
      needsReview: false,
      notes: [prepared.precheck.reason],
      model: 'rules',
      durationMs: Date.now() - startedAt,
      cached: false,
      generatedAt: new Date().toISOString(),
      facts: prepared.facts,
    });
  }

  const schema = judgmentSchema(ALT_KINDS);
  const system = systemPrompt();
  const prompt = userPrompt(context, prepared.facts);

  const samples: RawJudgment[] = [];
  const rounds = Math.max(1, options.consensus ?? 1);
  for (let round = 0; round < rounds; round++) {
    const { value } = await generateJson<RawJudgment>(
      {
        system,
        prompt,
        images: [prepared.base64],
        schema,
        // One shot is deterministic; sampling for agreement needs real variation.
        temperature: rounds === 1 ? 0.1 : 0.7,
        seed: rounds === 1 ? 7 : undefined,
      },
      options,
    );
    // The schema constrains the enum, but a corrupted answer should not poison the run.
    if (!ALT_KINDS.includes(value.kind)) value.kind = 'informative';
    samples.push(value);
  }

  const { winner, agreement } = majority(samples);
  const validated = validateJudgment(winner, context);
  const notes = [...validated.notes];
  let needsReview = validated.needsReview;

  if (rounds > 1 && agreement < 0.67) {
    needsReview = true;
    notes.push(
      `The model gave ${new Set(samples.map((s) => s.kind)).size} different categories across ${rounds} tries`,
    );
  }

  // A portrait is held because a model naming a stranger is the worst thing
  // this can write. That risk is gone when a record says who it is and the alt
  // uses exactly that name: the name came from the client's own CMS, not from
  // the model. Named any other way — or not named — it is still held.
  // A record-named portrait needs no hold: the name came from the client's
  // CMS. Anything the model added beyond it has to be readable in the image.
  const record =
    validated.kind === 'portrait' && context.subject
      ? altForRecordPortrait(validated.alt, context.subject, winner.visible_text)
      : null;
  const namedFromRecord = !!record;
  if (record?.trimmed) {
    notes.push(`Trimmed "${validated.alt}" to the name on the record — the rest was not in the image`);
    validated.alt = record.alt;
  }

  if (ALWAYS_REVIEW_KINDS.has(validated.kind) && !namedFromRecord) {
    needsReview = true;
    notes.push(
      validated.kind === 'portrait'
        ? 'A person — check the name is right before publishing'
        : 'A chart — the long description needs a human eye',
    );
  }

  if (options.reviewBelow === 'high' && winner.certainty !== 'high') needsReview = true;
  if (options.reviewBelow === 'medium' && winner.certainty === 'low') needsReview = true;

  let verified: boolean | undefined;
  if (options.verify && validated.alt) {
    try {
      const check = await verifyAlt(prepared.base64, validated.alt, options);
      verified = check.accurate;
      if (!check.accurate) {
        needsReview = true;
        notes.push(`Failed its own check: ${check.problem || 'the model did not stand by the description'}`);
      }
    } catch {
      notes.push('The verification pass could not run');
    }
  }

  return finish({
    fingerprint,
    src: context.src,
    kind: validated.kind,
    certainty: winner.certainty,
    alt: validated.alt,
    visibleText: winner.visible_text?.trim() || undefined,
    longDescription: validated.kind === 'chart' ? winner.long_description?.trim() || undefined : undefined,
    observation: winner.observation?.trim() || undefined,
    needsReview,
    notes,
    agreement: rounds > 1 ? agreement : undefined,
    verified,
    model,
    durationMs: Date.now() - startedAt,
    cached: false,
    generatedAt: new Date().toISOString(),
    facts: prepared.facts,
  });
}

export interface BatchProgress {
  done: number;
  total: number;
  suggestion?: AltSuggestion;
  context: ImageContext;
  error?: string;
}

/**
 * Run a list through the pipeline.
 *
 * Concurrency defaults to one because Ollama serialises requests to a single
 * model anyway: firing four at once on a laptop makes each of them slower and
 * risks swapping a 6 GB model against everything else running. Raise it only
 * with OLLAMA_NUM_PARALLEL set and memory to spare.
 */
export async function generateAltTextBatch(
  contexts: ImageContext[],
  options: GenerateOptions & {
    concurrency?: number;
    onProgress?: (progress: BatchProgress) => void;
  } = {},
): Promise<{ suggestions: AltSuggestion[]; failures: { context: ImageContext; error: string }[] }> {
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const suggestions: AltSuggestion[] = [];
  const failures: { context: ImageContext; error: string }[] = [];
  const queue = [...contexts];
  let done = 0;

  const worker = async () => {
    for (;;) {
      const context = queue.shift();
      if (!context) return;
      try {
        const suggestion = await generateAltText(context, options);
        suggestions.push(suggestion);
        done += 1;
        options.onProgress?.({ done, total: contexts.length, suggestion, context });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ context, error: message });
        done += 1;
        options.onProgress?.({ done, total: contexts.length, context, error: message });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, contexts.length) }, worker));
  return { suggestions, failures };
}
