import type { ProjectLink } from '@/types';

/**
 * The audit screen used to show three lists that counted in three different
 * units: page rows, unique image URLs, and per-`<a>` occurrences. Nothing added
 * up, and nothing could be acted on. This module turns what the scanner stores
 * per page into *findings* — one per thing someone would actually fix — so the
 * three tabs read from the same roll-up and a page's readiness follows from it.
 *
 * Everything here is pure and client-safe. Counting, grouping and "does this
 * clear the page" stay in code; Jev's probabilities are only ever used to order.
 */

// ── Fingerprints ───────────────────────────────────────────────────────────

/**
 * Same image, whatever the query string: `/hero.png?w=100` and `?w=800` are
 * one asset and one fix. Data URIs are fingerprinted by their stable head.
 */
export function imageFingerprint(rawSrc: string): string {
  const src = rawSrc.trim();
  if (!src) return '';
  if (src.startsWith('data:')) return src.slice(0, 120);
  try {
    const parsed = new URL(src);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.hostname.toLowerCase()}${pathname}`;
  } catch {
    const withoutHash = src.split('#')[0] || src;
    const withoutQuery = withoutHash.split('?')[0] || withoutHash;
    return withoutQuery.trim().toLowerCase();
  }
}

/** One destination, however many pages point at it. Fragment dropped, trailing slash kept. */
export function linkFingerprint(href: string): string {
  const trimmed = href.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed.split('#')[0].toLowerCase();
  }
}

/**
 * Firestore document id for a decision. Ids cannot contain `/` and are capped
 * in length, so the fingerprint is hashed. Two independent 32-bit FNV-1a passes
 * make a collision across a site's few thousand assets vanishingly unlikely,
 * and the plain fingerprint is stored in the document besides.
 */
export function decisionId(kind: FindingKind, fingerprint: string): string {
  return `${kind}_${fnv1a(fingerprint, 0x811c9dc5)}${fnv1a(fingerprint, 0x01000193)}`;
}

function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ── Webflow asset ids ──────────────────────────────────────────────────────

/**
 * Webflow serves uploaded assets as `<assetId>_<filename>` on its CDN hosts.
 * When the id is recoverable the alt text can be written back through the
 * Assets API instead of asking someone to find the image in Designer.
 */
export function webflowAssetIdFrom(src: string): string | null {
  try {
    const parsed = new URL(src);
    if (!/(^|\.)website-files\.com$|(^|\.)webflow\.com$/i.test(parsed.hostname)) return null;
    const file = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const match = /^([0-9a-f]{24})_/i.exec(file);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Decisions ──────────────────────────────────────────────────────────────

export type FindingKind = 'alt' | 'link';

export type DecisionKind =
  /** Image carries no meaning; an empty alt is correct. */
  | 'decorative'
  /** Someone decided this link stays as it is, with a reason. */
  | 'ignored'
  /** Alt text was written but no scan has confirmed it landed yet. */
  | 'fixed_unverified'
  /** A scan after the fix found it in place. */
  | 'verified';

export interface AuditDecision {
  id: string;
  kind: FindingKind;
  fingerprint: string;
  decision: DecisionKind;
  reason?: string;
  /** What was written, so the verify step can check for it. */
  altText?: string;
  by: string;
  /** ISO. */
  at: string;
}

// ── Findings ───────────────────────────────────────────────────────────────

export interface FindingPage {
  pageId: string;
  title: string;
  url: string;
  /** When this page's image or link data was last refreshed (ISO). */
  checkedAt?: string;
}

export type AltState =
  /** Open work: no alt, no decision, or the decision did not stick. */
  | 'open'
  /** Alt written; waiting on a scan to confirm. */
  | 'fixed_unverified'
  /** Someone said decorative / verified fixed. Hidden from open work. */
  | 'resolved'
  /** Verified or decorative earlier, but a newer scan still sees no alt. */
  | 'regressed';

export interface AltFinding {
  kind: 'alt';
  fingerprint: string;
  /** A representative src; the first one seen. */
  src: string;
  webflowAssetId: string | null;
  pages: FindingPage[];
  inMainContent: boolean;
  /** Jev: probability the image is decorative, when it was judged anywhere. */
  decorative?: number;
  state: AltState;
  decision?: AuditDecision;
}

export type LinkState = 'open' | 'resolved';

export interface LinkOccurrence extends FindingPage {
  text: string;
}

export interface LinkFinding {
  kind: 'link';
  fingerprint: string;
  href: string;
  status: number;
  error?: string;
  /** Distinct anchor texts, so "Cookie policy" and "Read more" both show. */
  texts: string[];
  pages: LinkOccurrence[];
  /** Jev: probability a visitor would click it. Highest across pages. */
  matters?: number;
  state: LinkState;
  decision?: AuditDecision;
}

export interface UnverifiableLink {
  fingerprint: string;
  href: string;
  status: number;
  reason: string;
  pages: LinkOccurrence[];
}

export interface AuditFindings {
  alt: AltFinding[];
  links: LinkFinding[];
  unverifiable: UnverifiableLink[];
  /** Pages with placeholder copy — the only thing that blocks shipping. */
  blocked: FindingPage[];
  /** Pages whose newest scan failed outright. */
  failed: FindingPage[];
}

/**
 * Images the scanner captures but that are never candidates for alt text:
 * social share cards and our own screenshots. Matched against the audit's own
 * OG/Twitter/screenshot URLs, not a substring list, so a client image called
 * `screenshot-of-dashboard.png` is not silently dropped.
 */
function nonApplicableFingerprints(audit: ProjectLink['auditResult']): Set<string> {
  const out = new Set<string>();
  if (!audit) return out;
  for (const src of [
    audit.categories?.openGraph?.image,
    audit.categories?.twitterCards?.image,
    audit.screenshotUrl,
    audit.previousScreenshotUrl,
  ]) {
    if (src) out.add(imageFingerprint(src));
  }
  return out;
}

interface SnapshotImage {
  src: string;
  alt?: string;
  inMainContent?: boolean;
}

function snapshotImages(link: ProjectLink): SnapshotImage[] {
  const snapshot = link.auditResult?.contentSnapshot as { images?: SnapshotImage[] } | undefined;
  return snapshot?.images ?? [];
}

function imageCheckedAt(link: ProjectLink): string | undefined {
  const seo = link.auditResult?.categories?.seo as { imageScanCheckedAt?: string } | undefined;
  return seo?.imageScanCheckedAt || link.auditResult?.lastRun;
}

function pageOf(link: ProjectLink, checkedAt?: string): FindingPage {
  return { pageId: link.id, title: link.title || 'Untitled', url: link.url, checkedAt };
}

function later(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
}

/**
 * A decision resolves a finding until evidence newer than the decision says
 * otherwise. "Decorative" holds forever — a person said so. "Verified" and
 * "fixed, unverified" hold only while no page scanned *after* the decision
 * still shows the image without alt; when one does, the finding comes back as
 * regressed (or stays fixed-unverified if nothing newer has been seen yet).
 */
function altStateFor(pages: FindingPage[], decision?: AuditDecision): AltState {
  if (!decision) return 'open';
  if (decision.decision === 'decorative') return 'resolved';
  const seenSince = pages.some((page) => later(page.checkedAt, decision.at));
  if (decision.decision === 'fixed_unverified') return seenSince ? 'regressed' : 'fixed_unverified';
  if (decision.decision === 'verified') return seenSince ? 'regressed' : 'resolved';
  return 'open';
}

export function collectFindings(
  links: ProjectLink[],
  decisions: readonly AuditDecision[] = [],
): AuditFindings {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const decisionFor = (kind: FindingKind, fingerprint: string) => byId.get(decisionId(kind, fingerprint));

  const alt = new Map<string, AltFinding>();
  const broken = new Map<string, LinkFinding>();
  const unverifiable = new Map<string, UnverifiableLink>();
  const blocked: FindingPage[] = [];
  const failed: FindingPage[] = [];

  for (const link of links) {
    const audit = link.auditResult;
    if (!audit) continue;

    if (audit.changeStatus === 'SCAN_FAILED') failed.push(pageOf(link, audit.lastRun));
    else if (audit.canDeploy === false) blocked.push(pageOf(link, audit.lastRun));

    // Images — one finding per asset, listing every page it is missing alt on.
    const skip = nonApplicableFingerprints(audit);
    const judged = new Map(
      (audit.categories?.judgment?.altText ?? []).map((j) => [imageFingerprint(j.src), j]),
    );
    const seenOnPage = new Set<string>();
    const checked = imageCheckedAt(link);
    for (const image of snapshotImages(link)) {
      const src = image?.src?.trim();
      if (!src || image.alt?.trim()) continue;
      const fp = imageFingerprint(src);
      if (!fp || skip.has(fp) || seenOnPage.has(fp)) continue;
      seenOnPage.add(fp);

      const existing = alt.get(fp);
      const judgment = judged.get(fp);
      if (existing) {
        existing.pages.push(pageOf(link, checked));
        existing.inMainContent = existing.inMainContent || !!image.inMainContent;
        if (judgment?.decorative !== undefined) {
          existing.decorative =
            existing.decorative === undefined
              ? judgment.decorative
              : Math.min(existing.decorative, judgment.decorative);
        }
      } else {
        alt.set(fp, {
          kind: 'alt',
          fingerprint: fp,
          src,
          webflowAssetId: webflowAssetIdFrom(src),
          pages: [pageOf(link, checked)],
          inMainContent: !!image.inMainContent,
          decorative: judgment?.decorative,
          state: 'open',
          decision: decisionFor('alt', fp),
        });
      }
    }

    // Links — one finding per destination.
    const linkCategory = audit.categories?.links;
    const linkChecked = linkCategory?.checkedAt;
    const mattersBy = new Map(
      (audit.categories?.judgment?.brokenLinks ?? []).map((j) => [linkFingerprint(j.href), j.matters]),
    );
    for (const b of linkCategory?.brokenLinks ?? []) {
      if (!b?.href) continue;
      const fp = linkFingerprint(b.href);
      const occurrence: LinkOccurrence = { ...pageOf(link, linkChecked), text: b.text || '' };
      const matters = mattersBy.get(fp);
      const existing = broken.get(fp);
      if (existing) {
        if (!existing.pages.some((p) => p.pageId === link.id && p.text === occurrence.text)) {
          existing.pages.push(occurrence);
        }
        if (occurrence.text && !existing.texts.includes(occurrence.text)) existing.texts.push(occurrence.text);
        if (matters !== undefined) existing.matters = Math.max(existing.matters ?? 0, matters);
      } else {
        broken.set(fp, {
          kind: 'link',
          fingerprint: fp,
          href: b.href,
          status: b.status,
          error: b.error,
          texts: occurrence.text ? [occurrence.text] : [],
          pages: [occurrence],
          matters,
          state: 'open',
          decision: decisionFor('link', fp),
        });
      }
    }
    for (const u of linkCategory?.unverifiableLinks ?? []) {
      if (!u?.href) continue;
      const fp = linkFingerprint(u.href);
      const occurrence: LinkOccurrence = { ...pageOf(link, linkChecked), text: u.text || '' };
      const existing = unverifiable.get(fp);
      if (existing) {
        if (!existing.pages.some((p) => p.pageId === link.id)) existing.pages.push(occurrence);
      } else {
        unverifiable.set(fp, { fingerprint: fp, href: u.href, status: u.status, reason: u.reason, pages: [occurrence] });
      }
    }
  }

  for (const finding of alt.values()) finding.state = altStateFor(finding.pages, finding.decision);
  for (const finding of broken.values()) {
    finding.state = finding.decision?.decision === 'ignored' ? 'resolved' : 'open';
  }

  return {
    alt: Array.from(alt.values()).sort(compareAlt),
    links: Array.from(broken.values()).sort(compareLinks),
    unverifiable: Array.from(unverifiable.values()).sort((a, b) => b.pages.length - a.pages.length),
    blocked,
    failed,
  };
}

// ── Ordering ───────────────────────────────────────────────────────────────

/** Jev's "probably decorative" reads as low priority; everything else by reach. */
export const LIKELY_DECORATIVE_AT = 0.75;

export function isLikelyDecorative(finding: AltFinding): boolean {
  return (finding.decorative ?? 0) >= LIKELY_DECORATIVE_AT;
}

function compareAlt(a: AltFinding, b: AltFinding): number {
  const da = isLikelyDecorative(a) ? 1 : 0;
  const db = isLikelyDecorative(b) ? 1 : 0;
  if (da !== db) return da - db;
  if (a.pages.length !== b.pages.length) return b.pages.length - a.pages.length;
  if (a.inMainContent !== b.inMainContent) return a.inMainContent ? -1 : 1;
  return a.src.localeCompare(b.src);
}

/** Links a visitor would click come first; among equals, the ones on more pages. */
function compareLinks(a: LinkFinding, b: LinkFinding): number {
  const ma = a.matters ?? 0.5;
  const mb = b.matters ?? 0.5;
  if (Math.abs(ma - mb) > 0.1) return mb - ma;
  if (a.pages.length !== b.pages.length) return b.pages.length - a.pages.length;
  return a.href.localeCompare(b.href);
}

// ── Roll-up: the Fixes table ───────────────────────────────────────────────

export type FixGroupId =
  | 'alt_shared'
  | 'alt_single'
  | 'alt_decorative_likely'
  | 'links_shared'
  | 'links_single'
  | 'links_unverifiable';

export interface FixGroup {
  id: FixGroupId;
  /** Distinct things to change. */
  fixes: number;
  /** Pages that stop flagging once the fixes land. */
  pagesCleared: number;
  /** Individual page-level flags that go away. */
  flagsCleared: number;
}

export const SHARED_ACROSS_PAGES_AT = 2;

/**
 * The header table: every open finding, rolled up by what someone would do
 * about it, so "8 template images → 1 fix → 294 pages" is visible without
 * anyone counting rows.
 */
export function fixesRollup(findings: AuditFindings): FixGroup[] {
  const openAlt = findings.alt.filter((f) => f.state === 'open' || f.state === 'regressed');
  const openLinks = findings.links.filter((f) => f.state === 'open');

  const group = <T extends { pages: FindingPage[] }>(id: FixGroupId, items: T[]): FixGroup => ({
    id,
    fixes: items.length,
    pagesCleared: new Set(items.flatMap((i) => i.pages.map((p) => p.pageId))).size,
    flagsCleared: items.reduce((n, i) => n + i.pages.length, 0),
  });

  const decorativeLikely = openAlt.filter(isLikelyDecorative);
  const needsAlt = openAlt.filter((f) => !isLikelyDecorative(f));

  return [
    group('alt_shared', needsAlt.filter((f) => f.pages.length >= SHARED_ACROSS_PAGES_AT)),
    group('alt_single', needsAlt.filter((f) => f.pages.length < SHARED_ACROSS_PAGES_AT)),
    group('alt_decorative_likely', decorativeLikely),
    group('links_shared', openLinks.filter((f) => f.pages.length >= SHARED_ACROSS_PAGES_AT)),
    group('links_single', openLinks.filter((f) => f.pages.length < SHARED_ACROSS_PAGES_AT)),
    group('links_unverifiable', findings.unverifiable),
  ].filter((g) => g.fixes > 0);
}

// ── Readiness: what the Pages tab shows per row ────────────────────────────

export type Readiness =
  /** Placeholder copy on the page. Do not ship. */
  | 'blocked'
  /** Newest scan failed; nothing is known. */
  | 'scan_failed'
  /** Has an open finding that only it carries. */
  | 'fix_needed'
  /** Its only open findings are shared assets, already being handled as one fix. */
  | 'template_fix_pending'
  /** Never scanned. */
  | 'unscanned'
  | 'ready';

export interface PageFindings {
  alt: AltFinding[];
  links: LinkFinding[];
  unverifiable: UnverifiableLink[];
}

/** Everything open that touches one page, for the row sheet. */
export function findingsForPage(findings: AuditFindings, pageId: string): PageFindings {
  const touches = (pages: FindingPage[]) => pages.some((p) => p.pageId === pageId);
  return {
    alt: findings.alt.filter((f) => (f.state === 'open' || f.state === 'regressed') && touches(f.pages)),
    links: findings.links.filter((f) => f.state === 'open' && touches(f.pages)),
    unverifiable: findings.unverifiable.filter((u) => touches(u.pages)),
  };
}

export function readinessOf(link: ProjectLink, findings: AuditFindings): Readiness {
  const audit = link.auditResult;
  if (!audit) return 'unscanned';
  if (audit.changeStatus === 'SCAN_FAILED') return 'scan_failed';
  if (audit.canDeploy === false) return 'blocked';

  const own = findingsForPage(findings, link.id);
  const open = [...own.alt.filter((f) => !isLikelyDecorative(f)), ...own.links];
  if (open.length === 0) return 'ready';
  return open.every((f) => f.pages.length >= SHARED_ACROSS_PAGES_AT) ? 'template_fix_pending' : 'fix_needed';
}

export const READINESS_LABEL: Record<Readiness, string> = {
  blocked: 'Blocked',
  scan_failed: 'Scan failed',
  fix_needed: 'Fix needed',
  template_fix_pending: 'Template fix pending',
  unscanned: 'Not scanned',
  ready: 'Ready',
};

// ── Export ─────────────────────────────────────────────────────────────────

export function compactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.pathname || '/'}`;
  } catch {
    return rawUrl;
  }
}

/**
 * The fix list as Markdown, grouped the same way the header groups it, for a
 * Slack message or a client who edits their own site.
 */
export function fixListMarkdown(findings: AuditFindings, siteLabel?: string): string {
  const lines: string[] = [];
  lines.push(`# Fix list${siteLabel ? ` — ${siteLabel}` : ''}`);
  lines.push('');

  if (findings.blocked.length > 0) {
    lines.push('## Placeholder copy (blocks launch)');
    for (const page of findings.blocked) lines.push(`- ${page.title} — ${page.url}`);
    lines.push('');
  }

  const openAlt = findings.alt.filter((f) => f.state === 'open' || f.state === 'regressed');
  const needsAlt = openAlt.filter((f) => !isLikelyDecorative(f));
  if (needsAlt.length > 0) {
    lines.push('## Images that need alt text');
    lines.push('');
    lines.push('| Image | On | Fix |');
    lines.push('| --- | --- | --- |');
    for (const f of needsAlt) {
      const where = f.pages.length === 1 ? compactUrl(f.pages[0].url) : `${f.pages.length} pages`;
      lines.push(`| ${fileNameOf(f.src)} | ${where} | Add alt text${f.state === 'regressed' ? ' (regressed)' : ''} |`);
    }
    lines.push('');
  }
  const decorativeLikely = openAlt.filter(isLikelyDecorative);
  if (decorativeLikely.length > 0) {
    lines.push(`## Probably decorative — confirm (${decorativeLikely.length})`);
    for (const f of decorativeLikely) lines.push(`- ${fileNameOf(f.src)} — ${f.pages.length} page${f.pages.length === 1 ? '' : 's'}`);
    lines.push('');
  }

  const openLinks = findings.links.filter((f) => f.state === 'open');
  if (openLinks.length > 0) {
    lines.push('## Dead links');
    lines.push('');
    lines.push('| Link | Text | Status | On |');
    lines.push('| --- | --- | --- | --- |');
    for (const f of openLinks) {
      const where = f.pages.length === 1 ? compactUrl(f.pages[0].url) : `${f.pages.length} pages`;
      lines.push(`| ${f.href} | ${f.texts[0] ?? ''} | ${f.status || f.error || '—'} | ${where} |`);
    }
    lines.push('');
  }

  if (findings.unverifiable.length > 0) {
    lines.push(`## Could not verify (${findings.unverifiable.length})`);
    lines.push('These answered with a bot-block; check them by hand.');
    for (const u of findings.unverifiable) lines.push(`- ${u.href} (${u.status})`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function fileNameOf(src: string): string {
  try {
    const path = new URL(src, 'https://example.invalid').pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() || src);
  } catch {
    return src;
  }
}
