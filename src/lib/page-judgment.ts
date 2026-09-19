import type { ContentSnapshot, ExtendedContentSnapshot, PageJudgment } from '@/types';

/**
 * The parts of the Jev page judgment that both the server and the browser need.
 *
 * The judgment itself is made server-side (`src/lib/jev-qa.ts` is `server-only`,
 * because it holds the API key), but two things about it have to be known on
 * both sides: how a probability is read, and what counts as still current. So
 * they live here, in a module with no server imports, rather than being written
 * twice and drifting apart.
 */

/**
 * The bands a probability is read against.
 *
 * Mirrors `JEV_THRESHOLDS` in `src/lib/jev-qa.ts`, which is where they are
 * reviewed and tuned, and `delivery.progress.ts`, which mirrors them for the
 * same reason. They are duplicated rather than imported because `jev-qa` is
 * server-only and importing it into a component would drag the API key module
 * into the client bundle.
 */
export const JUDGMENT_PASS_AT = 0.75;
export const JUDGMENT_FAIL_AT = 0.35;

/**
 * Four states, not two.
 *
 * `uncertain` is the wide band in the middle and it is not a soft fail — it
 * means Jev could not call it and a person should look. `unchecked` means
 * nothing was asked at all, which is what an unconfigured deployment and a
 * page scanned before Jev existed both look like.
 */
export type JudgmentVerdict = 'pass' | 'uncertain' | 'fail' | 'unchecked';

export function readJudgment(probability: number | undefined): JudgmentVerdict {
  if (typeof probability !== 'number' || Number.isNaN(probability)) return 'unchecked';
  if (probability >= JUDGMENT_PASS_AT) return 'pass';
  if (probability <= JUDGMENT_FAIL_AT) return 'fail';
  return 'uncertain';
}

/**
 * How long a carried-forward judgment stays good for.
 *
 * A page nobody has touched does not need re-judging nightly, but the questions
 * and the thresholds in `jev-qa.ts` are expected to move while they are being
 * calibrated, and a judgment made under the old ones would otherwise sit on a
 * static page forever. A month means a tuning change reaches every page without
 * anyone running a backfill, at the cost of one request per page per month.
 */
export const JUDGMENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether this scan should pay for a fresh judgment.
 *
 * This runs on a nightly cron across every page of every live project, and a
 * judgment costs a request where the mechanical checks cost nothing. Re-judging
 * a page whose content is byte-identical to last night buys the same answer
 * twice, so the previous judgment is carried forward instead.
 *
 * The key is `fullHash`, not `contentHash`. `contentHash` is the body text
 * alone, and a title, meta description or alt attribute can change without it
 * moving — those are exactly what Jev is being asked about. `fullHash` covers
 * all of them (and links too, so a changed link re-judges a page needlessly;
 * that is the safe direction to be wrong in).
 */
export function shouldJudgePage(params: {
  previousJudgment?: PageJudgment;
  previousFullHash?: string;
  fullHash?: string;
  now?: Date;
}): boolean {
  const { previousJudgment, previousFullHash, fullHash } = params;

  if (!previousJudgment) return true;

  // A missing hash on either side means we cannot prove the page is unchanged,
  // and guessing "unchanged" would silently freeze a stale judgment in place.
  if (!fullHash || !previousFullHash || fullHash !== previousFullHash) return true;

  const checkedAt = Date.parse(previousJudgment.checkedAt ?? '');
  if (Number.isNaN(checkedAt)) return true;

  const now = (params.now ?? new Date()).getTime();
  return now - checkedAt >= JUDGMENT_MAX_AGE_MS;
}

/** The shape `judgePage` takes, restated here so this module stays client-safe. */
export interface PageJudgmentInput {
  url: string;
  title?: string;
  metaDescription?: string;
  h1?: string;
  copy?: string;
  images?: { src: string; alt?: string }[];
  spellingCandidates?: { word: string; suggestion?: string }[];
  brokenLinks?: { href: string; text?: string }[];
  schemaTypes?: string[];
}

/** Sections sampled for the copy excerpt. The scanner only extracts ten. */
const MAX_SECTIONS_IN_COPY = 10;

/** Matches the cap in `jev-qa.ts`; trimming here keeps the request small. */
const MAX_BROKEN_LINKS_JUDGED = 15;

/** Images put to Jev. It judges at most twelve; sending more is wasted state. */
const MAX_IMAGES_JUDGED = 12;

const MAX_SPELLING_CANDIDATES = 20;

/**
 * Assemble what Jev sees from what the scan already extracted.
 *
 * Nothing here re-parses the page. The scanner has already walked the DOM once
 * and a second pass would double the CPU of every cron run for content it
 * already holds.
 *
 * The copy is stitched from the body-text preview plus each section's preview
 * rather than from the preview alone: the preview is the first 500 characters,
 * which is the hero, and "lorem ipsum in the third section" is precisely the
 * thing it would miss.
 */
export function buildPageJudgmentInput(params: {
  url: string;
  snapshot?: ContentSnapshot | ExtendedContentSnapshot;
  spellingIssues?: { word: string; suggestion?: string }[];
  /** What the link checker found dead, for triage by likely impact. */
  brokenLinks?: { href: string; text?: string }[];
  /** Schema types the page declares, to check against what the page is. */
  schemaTypes?: string[];
}): PageJudgmentInput {
  const { url, snapshot } = params;
  const extended = snapshot as ExtendedContentSnapshot | undefined;

  const copyParts: string[] = [];
  const seen = new Set<string>();
  const push = (text: string | undefined) => {
    const trimmed = text?.replace(/\s+/g, ' ').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    copyParts.push(trimmed);
  };

  push(extended?.bodyTextPreview);
  for (const section of (extended?.sections ?? []).slice(0, MAX_SECTIONS_IN_COPY)) {
    push(section.headingText ? `${section.headingText}: ${section.textPreview}` : section.textPreview);
  }

  // Images outside the main content are the logo, the social icons and the
  // footer badge. Judging those first would spend the whole per-page budget on
  // furniture and never reach the picture the page is actually about.
  const allImages = extended?.images ?? [];
  const images = [
    ...allImages.filter((image) => image.inMainContent),
    ...allImages.filter((image) => !image.inMainContent),
  ]
    .slice(0, MAX_IMAGES_JUDGED)
    .map((image) => ({ src: image.src, alt: image.alt || undefined }));

  return {
    url,
    title: snapshot?.title || undefined,
    metaDescription: snapshot?.metaDescription || undefined,
    h1: snapshot?.h1 || undefined,
    copy: copyParts.length > 0 ? copyParts.join('\n\n') : undefined,
    images: images.length > 0 ? images : undefined,
    spellingCandidates:
      params.spellingIssues && params.spellingIssues.length > 0
        ? params.spellingIssues.slice(0, MAX_SPELLING_CANDIDATES)
        : undefined,
    // Triaged rather than re-checked: the link checker already decided these
    // are dead, and the judgment is only about which ones anyone would miss.
    brokenLinks:
      params.brokenLinks && params.brokenLinks.length > 0
        ? params.brokenLinks.slice(0, MAX_BROKEN_LINKS_JUDGED)
        : undefined,
    schemaTypes: params.schemaTypes?.length ? params.schemaTypes : undefined,
  };
}
