import 'server-only';
import { judgePage, type JudgePageInput } from '@/lib/jev-qa';
import { buildPageJudgmentInput, shouldJudgePage } from '@/lib/page-judgment';
import type { PageScanResult } from '@/services/PageScanner';
import type { AuditResult, PageJudgment } from '@/types';

/**
 * The Jev judgment, run as an enrichment step between the scan and the save.
 *
 * `PageScanner` is a synchronous cheerio pass — it takes HTML and returns a
 * finished `AuditResult`, and nothing in it awaits anything. Judging a page is
 * a network call to TypeSafe, so it cannot live inside that assembly without
 * turning the whole scanner async for every caller, including the two that only
 * want images or fonts. It sits here instead: after the audit is built, before
 * it is persisted, attaching to `categories.judgment`.
 *
 * **Nothing in here is allowed to fail a scan.** No API key, a timeout, a 500
 * from TypeSafe — the page still scans and saves exactly as it did before Jev
 * existed, with no judgment attached. `unknown` already means "nobody checked"
 * everywhere downstream, so an absent judgment is a state the app understands,
 * and a nightly cron must never die because a third party had a bad minute.
 */

export interface JudgeScannedPageParams {
  url: string;
  scanResult: PageScanResult;
  /** The audit saved by the previous scan, which carries the last judgment. */
  previous?: AuditResult;
}

export async function judgeScannedPage({
  url,
  scanResult,
  previous,
}: JudgeScannedPageParams): Promise<PageJudgment | undefined> {
  const previousJudgment = previous?.categories?.judgment;
  const contentUnchanged = Boolean(
    scanResult.fullHash && previous?.fullHash && scanResult.fullHash === previous.fullHash,
  );

  if (
    !shouldJudgePage({
      previousJudgment,
      previousFullHash: previous?.fullHash,
      fullHash: scanResult.fullHash,
    })
  ) {
    // The page is byte-identical to the one this judgment was made about, so it
    // is still the right answer — and re-asking would bill us for it again.
    return previousJudgment;
  }

  const input: JudgePageInput = buildPageJudgmentInput({
    url,
    snapshot: scanResult.contentSnapshot,
    spellingIssues: scanResult.categories?.spelling?.issues,
    // Populated by the link checker, which runs alongside the scan. Absent on a
    // page whose links have not been checked yet, and that is fine — the
    // triage simply has nothing to order.
    brokenLinks: scanResult.categories?.links?.brokenLinks?.map((link) => ({
      href: link.href,
      text: link.text,
    })),
    schemaTypes: scanResult.categories?.schema?.schemaTypes,
  });

  try {
    const judgment = await judgePage(input);
    if (judgment) return judgment;

    // No key configured, or nothing on the page worth asking about. Either way
    // this is the designed quiet path, not an error, so it is not logged.
    return contentUnchanged ? previousJudgment : undefined;
  } catch (error) {
    console.warn(`[page-judgment] Judgment skipped for ${url}:`, error);

    // A stale judgment about *this exact content* is still true, so an outage
    // during the periodic refresh keeps it. When the content moved, the old
    // judgment is about a page that no longer exists and dropping it back to
    // "not checked" is the only honest answer.
    return contentUnchanged ? previousJudgment : undefined;
  }
}
