import 'server-only';
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { compactAuditResult } from '@/lib/scan-utils';
import type { AuditResult, ImageInfo, ImageScanJob, Project, ProjectLink } from '@/types';

/**
 * Server-side writes for a single page's audit.
 *
 * The image-scan routes used to call `projectsService` — the *browser* SDK —
 * from a route handler. There is no signed-in user on the server, so once the
 * rules stopped letting anonymous callers read `projects`, every "Scan Images"
 * click came back as "Missing or insufficient permissions". These helpers use
 * firebase-admin, and they touch exactly one audit document: the old path read
 * the whole `link_audits` subcollection twice and rewrote every page's audit to
 * change one.
 */

const LINK_AUDITS = 'link_audits';

export class AuditAdminUnavailableError extends Error {
  constructor() {
    super('Server-side Firebase credentials are not configured');
    this.name = 'AuditAdminUnavailableError';
  }
}

function projectRef(projectId: string) {
  if (!hasFirebaseAdminCredentials) throw new AuditAdminUnavailableError();
  return adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
}

function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(stripUndefined) as T;
  if (obj && typeof obj === 'object' && !(obj instanceof AdminTimestamp) && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return obj;
}

/** The project document alone — no audits. Enough to find a link and its URL. */
export async function loadProjectDocAdmin(projectId: string): Promise<Project | null> {
  const snap = await projectRef(projectId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Project, 'id'>) } as Project;
}

export async function loadLinkAuditAdmin(projectId: string, linkId: string): Promise<AuditResult | null> {
  const snap = await projectRef(projectId).collection(LINK_AUDITS).doc(linkId).get();
  return snap.exists ? (snap.data() as AuditResult) : null;
}

export interface ImageAltScanResults {
  totalImages: number;
  uniqueMissingAltCount: number;
  images: ImageInfo[];
  checkedAt: string;
}

/**
 * Record an image-only scan on one page. Deliberately does *not* touch
 * `lastRun`: that is when the page's content was last audited, and an image
 * pass is not that. The audit screen reads `imageScanCheckedAt` instead.
 */
export async function saveImageAltResultsAdmin(
  projectId: string,
  linkId: string,
  results: ImageAltScanResults,
): Promise<void> {
  const ref = projectRef(projectId).collection(LINK_AUDITS).doc(linkId);
  const current = ((await ref.get()).data() as AuditResult | undefined) ?? ({} as AuditResult);
  const categories = current.categories ?? ({} as NonNullable<AuditResult['categories']>);
  const seo = (categories.seo ?? {}) as Record<string, unknown>;

  const next = {
    ...current,
    categories: {
      ...categories,
      seo: { ...seo, imagesWithoutAlt: results.uniqueMissingAltCount, imageScanCheckedAt: results.checkedAt },
    },
    contentSnapshot: { ...(current.contentSnapshot ?? {}), images: results.images },
  } as unknown as AuditResult;

  await ref.set(stripUndefined(compactAuditResult(next, 'standard')));
}

export interface BrokenLinkResults {
  totalChecked: number;
  totalLinks: number;
  brokenLinks: { href: string; status: number; text: string; error?: string }[];
  unverifiableLinks?: { href: string; status: number; text: string; reason: string }[];
  validLinks: number;
}

export async function saveBrokenLinkResultsAdmin(
  projectId: string,
  linkId: string,
  results: BrokenLinkResults,
): Promise<void> {
  const ref = projectRef(projectId).collection(LINK_AUDITS).doc(linkId);
  const current = ((await ref.get()).data() as AuditResult | undefined) ?? ({} as AuditResult);
  const categories = current.categories ?? ({} as NonNullable<AuditResult['categories']>);
  const links = (categories.links ?? {}) as Partial<NonNullable<AuditResult['categories']>['links']>;

  const next = {
    ...current,
    categories: {
      ...categories,
      links: {
        ...links,
        totalLinks: results.totalLinks,
        internalLinks: links?.internalLinks ?? 0,
        externalLinks: links?.externalLinks ?? 0,
        brokenLinks: results.brokenLinks,
        unverifiableLinks: results.unverifiableLinks ?? [],
        checkedAt: new Date().toISOString(),
        status: results.brokenLinks.length > 0 ? 'failed' : 'passed',
        score: results.brokenLinks.length === 0 ? 100 : Math.max(0, 100 - results.brokenLinks.length * 20),
      },
    },
  } as AuditResult;

  await ref.set(stripUndefined(compactAuditResult(next, 'standard')));
}

/**
 * Progress for the durable image scan lives on the project document so every
 * open tab sees it. It must not bump `updatedAt`: the project list sorts by it,
 * and a background heartbeat reshuffling the dashboard is the kind of thing
 * nobody can explain later.
 */
export async function setImageScanJobAdmin(projectId: string, job: ImageScanJob | null): Promise<void> {
  await projectRef(projectId).set(
    { imageScanJob: job === null ? FieldValue.delete() : stripUndefined(job) },
    { merge: true },
  );
}

export function linkOf(project: Project, linkId: string): ProjectLink | undefined {
  return (project.links ?? []).find((l) => l.id === linkId);
}
