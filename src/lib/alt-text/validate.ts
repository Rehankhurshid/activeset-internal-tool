import { EMPTY_ALT_KINDS, MAX_ALT_CHARS, fileNameOf } from './taxonomy';
import type { AltKind, ImageContext, RawJudgment } from './types';

/**
 * What happens to the model's answer before anyone sees it.
 *
 * A vision model will write "Image of a smiling woman at a laptop." forever,
 * however firmly the prompt forbids it, and there is no reason to spend a
 * second model call fixing something a regular expression fixes exactly.
 * Rules that can be enforced are enforced here; only judgement is left to the
 * model.
 */

/** Openers that add nothing: a screen reader has already said "image". */
const REDUNDANT_OPENERS = [
  /^(an?\s+)?image\s+(of|showing|depicting|that shows)\s+/i,
  /^(an?\s+)?photo(graph)?\s+(of|showing|depicting)\s+/i,
  /^(an?\s+)?picture\s+(of|showing|depicting)\s+/i,
  /^(an?\s+)?graphic\s+(of|showing|depicting)\s+/i,
  /^(an?\s+)?illustration\s+(of|showing|depicting)\s+/i,
  /^(an?\s+)?screenshot\s+of\s+/i,
  /^(an?\s+)?icon\s+(of|showing)\s+/i,
  /^this\s+image\s+(shows|depicts|is)\s+/i,
  /^the\s+image\s+(shows|depicts|is)\s+/i,
  /^(it\s+)?(shows|depicts)\s+/i,
  /^alt(\s*text)?\s*[:\-]\s*/i,
];

/** Words a model reaches for when it has nothing to say. */
const FILLER_PATTERNS = [
  /\b(unknown|unclear|cannot determine|not sure|n\/a|no description available)\b/i,
  /\bplaceholder\b/i,
  /\blorem ipsum\b/i,
];

/** Below this, "text in the image" is a wordmark, not a text image. */
export const MIN_TRANSCRIPTION_CHARS = 18;

export interface ValidationResult {
  alt: string;
  kind: AltKind;
  needsReview: boolean;
  notes: string[];
}

function tidy(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, '')
    .trim();
}

/** Cut at a word boundary rather than mid-word, and never leave a dangling comma. */
export function truncateAlt(value: string, max = MAX_ALT_CHARS): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '');
}

export function stripRedundantOpener(value: string): string {
  let out = value;
  for (const pattern of REDUNDANT_OPENERS) {
    const next = out.replace(pattern, '');
    if (next !== out) {
      out = next.charAt(0).toUpperCase() + next.slice(1);
      break;
    }
  }
  return out;
}

/** True when the alt is really just the file name with the punctuation swapped. */
export function echoesFileName(alt: string, src: string): boolean {
  const normalise = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const name = normalise(fileNameOf(src).replace(/\.[a-z0-9]+$/i, ''));
  if (name.length < 6) return false;
  return normalise(alt) === name;
}

/**
 * Apply every rule that does not need a model, and say what was repaired.
 * The notes matter as much as the text: a reviewer seeing "trimmed to 125
 * characters" reads the row differently from one seeing "the model's answer
 * was the file name".
 */
/**
 * An image that is the only thing inside a link is functional. That is not a
 * judgement the model gets to make — it is the W3C rule — and a 7B model
 * applies it unevenly: on one nav bar it labelled two icons by their
 * destination and described the third one's pictogram. Code settles it.
 */
const DESCRIBED_WHEN_IT_SHOULD_NAVIGATE: ReadonlySet<AltKind> = new Set<AltKind>([
  'informative',
  'icon',
  'product',
  'portrait',
  'screenshot',
]);

function isSoleContentOfLink(context: ImageContext): boolean {
  return !!context.linkHref && !context.linkText?.trim();
}

export function validateJudgment(
  judgment: RawJudgment,
  context: ImageContext,
): ValidationResult {
  const notes: string[] = [];
  let needsReview = false;
  let kind = judgment.kind;

  if (isSoleContentOfLink(context) && DESCRIBED_WHEN_IT_SHOULD_NAVIGATE.has(kind)) {
    kind = 'functional';
    needsReview = true;
    notes.push(
      `This is the only thing inside a link to ${context.linkHref} — the alt should name where it goes, not what it looks like`,
    );
  }

  // Decorative is a decision about the alt attribute, not a description, so
  // whatever the model wrote in `alt` is discarded rather than trimmed.
  if (EMPTY_ALT_KINDS.has(kind)) {
    if (tidy(judgment.alt).length > 0) {
      notes.push('Classified decorative, so the suggested text was dropped and the alt left empty');
    }
    return { alt: '', kind, needsReview: judgment.certainty === 'low', notes };
  }

  let alt = tidy(judgment.alt);

  if (!alt) {
    return {
      alt: '',
      kind,
      needsReview: true,
      notes: ['The model classified this as needing alt text but wrote none'],
    };
  }

  const beforeOpener = alt;
  alt = tidy(stripRedundantOpener(alt));
  if (alt !== beforeOpener) notes.push('Removed a redundant "image of" opener');

  // A transcription is only correct if it is exact, so it is taken from
  // `visible_text` rather than from whatever the model paraphrased.
  if (kind === 'text_image') {
    const transcript = tidy(judgment.visible_text);
    // A handful of characters is a wordmark inside a photograph, not an image
    // made of text. Substituting it produced alt="IVECO" for a photograph of a
    // branded lorry, which is worse than the description it replaced.
    if (transcript.length > 0 && transcript.length < MIN_TRANSCRIPTION_CHARS) {
      needsReview = true;
      notes.push(
        `Called a text image but only "${transcript}" is legible — it is more likely a photograph containing a logo`,
      );
    } else if (transcript && transcript.length <= MAX_ALT_CHARS && transcript.toLowerCase() !== alt.toLowerCase()) {
      alt = transcript;
      notes.push('Used the verbatim transcription rather than a paraphrase');
    } else if (transcript.length > MAX_ALT_CHARS) {
      needsReview = true;
      notes.push('The image carries more text than fits in an alt attribute — it may need a real text alternative');
    }
  }

  if (alt.length > MAX_ALT_CHARS) {
    alt = truncateAlt(alt);
    needsReview = true;
    notes.push(`Trimmed to ${MAX_ALT_CHARS} characters`);
  }

  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(alt)) {
      needsReview = true;
      notes.push('The wording reads like a placeholder rather than a description');
      break;
    }
  }

  if (echoesFileName(alt, context.src)) {
    needsReview = true;
    notes.push('The suggestion is just the file name');
  }

  // Repeating a caption or heading verbatim makes a screen reader say it
  // twice. Worth a person's eye rather than an automatic edit.
  for (const [label, value] of [
    ['caption', context.caption],
    ['heading', context.heading],
  ] as const) {
    if (value && tidy(value).toLowerCase() === alt.toLowerCase()) {
      needsReview = true;
      notes.push(`Repeats the ${label} word for word — the image may be decorative`);
      break;
    }
  }

  if (/\b(image|picture|photo|graphic)\b/i.test(alt) && kind !== 'logo' && kind !== 'screenshot') {
    needsReview = true;
    notes.push('Still contains the word "image"');
  }

  if (alt.length < 3) {
    needsReview = true;
    notes.push('Too short to mean anything');
  }

  if (judgment.certainty === 'low') {
    needsReview = true;
    notes.push('The model was unsure of the category');
  }

  // Sentence case, no trailing full stop on a fragment. A full sentence keeps
  // its stop; a noun phrase does not need one.
  alt = alt.charAt(0).toUpperCase() + alt.slice(1);
  if (/^[^.!?]*\.$/.test(alt) && alt.split(' ').length <= 6) alt = alt.slice(0, -1);

  return { alt, kind, needsReview, notes };
}

/**
 * A portrait named from its CMS record: the name, and only what the image
 * itself says besides.
 *
 * The record supplies who someone is, so a portrait whose alt uses that name
 * is safe to publish unread — the name came from the client's own CMS, not
 * the model. Nothing else in the alt has that guarantee. Given "Jevyn Ong" and
 * a plain headshot with no text in it, the model wrote "Jevyn Ong, Head of
 * Design": a job title from nowhere. So extra words survive only if they can
 * be read in the image; otherwise the alt is the name, which is also how the
 * client's own team writes it.
 *
 * Returns null when the alt does not use the record's name at all — that
 * portrait stays held for a person.
 */
export function altForRecordPortrait(
  alt: string,
  subject: string,
  visibleText?: string,
): { alt: string; trimmed: boolean } | null {
  const name = subject.trim();
  if (!name || !alt.toLowerCase().includes(name.toLowerCase())) return null;
  const seen = (visibleText ?? '').toLowerCase();
  const extra = alt
    .toLowerCase()
    .replace(name.toLowerCase(), ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  return extra.some((word) => !seen.includes(word)) ? { alt: name, trimmed: true } : { alt, trimmed: false };
}
