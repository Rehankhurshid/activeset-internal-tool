import { isLikelyDecorative, type AltFinding } from './audit-findings';

/**
 * One answer to "how many images are missing ALT", shared by both screens.
 *
 * The Audit tab counted images a visitor gets with no ALT — 9 on PeakXV. The
 * Webflow tab counted empty ALT fields in the library — about 1,900. Both
 * were true and they looked like a contradiction. Joined image by image:
 *
 *   1,634  empty in Webflow, not on any page of the site
 *     258  empty in Webflow, but the page supplies ALT anyway (the Designer
 *          template binds something else, usually the item's name)
 *       5  empty in Webflow and rendered with no ALT — the real problem
 *
 * plus four slider images whose ALT *is* set in Webflow but which Designer
 * renders without it, and a placeholder SVG that is not in the library.
 *
 * So the headline everywhere is the visitor's number, defined here once, and
 * the library's empty fields are shown for what they are rather than as a
 * bigger version of the same problem.
 */

/** The Audit tab's rule: open or regressed, and not likely decorative. */
export function needsAltOnSite(finding: AltFinding): boolean {
  return (finding.state === 'open' || finding.state === 'regressed') && !isLikelyDecorative(finding);
}

/**
 * The same file, whichever host serves it.
 *
 * Webflow's Assets API reports a site asset at `s3.amazonaws.com/webflow-prod-
 * assets/<site>/<file>`; its pages load it from `cdn.prod.website-files.com/
 * <site>/<file>`. Matching whole URLs said all 729 of PeakXV's general assets
 * were on no page at all. The last two path segments are the file.
 */
export function imagePathKey(url: string): string {
  try {
    const parts = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean);
    return parts.slice(-2).join('/').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export interface PageCoverage {
  /** Scanned pages the image appears on. */
  pages: number;
  /** Of those, how many render it with ALT. */
  withAlt: number;
}

export type SiteAltStatus =
  /** A visitor gets this image with no ALT. */
  | 'missing-on-site'
  /** Empty in Webflow, but every page that shows it supplies ALT. */
  | 'covered-by-page'
  /** Empty in Webflow and not on any scanned page. */
  | 'not-on-site'
  /** Nothing to do. */
  | 'ok';

export function siteAltStatus(input: {
  /** The library's own ALT field is empty. */
  libraryEmpty: boolean;
  /** How the scanned pages render it, if they do. */
  coverage?: PageCoverage;
  /** It is on the Audit's list of images visitors get with no ALT. */
  missingOnSite: boolean;
}): SiteAltStatus {
  if (input.missingOnSite) return 'missing-on-site';
  if (!input.libraryEmpty) return 'ok';
  if (!input.coverage || input.coverage.pages === 0) return 'not-on-site';
  return input.coverage.withAlt > 0 ? 'covered-by-page' : 'ok';
}
