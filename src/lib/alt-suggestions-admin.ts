import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import {
  collectFindings,
  decisionId,
  type AuditDecision,
} from '@/modules/site-monitoring/domain/audit-findings';
import type { AltSuggestion } from '@/lib/alt-text/types';
import type { AuditResult, Project, ProjectLink } from '@/types';

/**
 * Where the local classifier's answers meet the app.
 *
 * The generator runs on a laptop with Ollama; the Audit tab runs wherever
 * Rehan is, including a phone. Rather than the browser reaching into
 * localhost — which needs CORS, private-network permission and the laptop
 * awake — the terminal writes its suggestions to Firestore and the tab reads
 * them. They key on the same image fingerprint the audit findings use, so a
 * suggestion lands on exactly the row it belongs to.
 *
 * Deliberately not `server-only`: the CLI imports this from plain Node.
 */

const ALT_SUGGESTIONS = 'alt_suggestions';
const LINK_AUDITS = 'link_audits';

/** What gets stored. The base64 and the raw pixels stay on the laptop. */
export interface StoredAltSuggestion {
  id: string;
  fingerprint: string;
  src: string;
  kind: AltSuggestion['kind'];
  certainty: AltSuggestion['certainty'];
  alt: string;
  visibleText?: string;
  longDescription?: string;
  observation?: string;
  needsReview: boolean;
  notes: string[];
  agreement?: number;
  verified?: boolean;
  model: string;
  generatedAt: string;
}

export class AltSuggestionsUnavailableError extends Error {
  constructor() {
    super('No Firebase admin credentials. Run: npx vercel env pull .env.local');
    this.name = 'AltSuggestionsUnavailableError';
  }
}

function projectRef(projectId: string) {
  if (!hasFirebaseAdminCredentials) throw new AltSuggestionsUnavailableError();
  return adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export interface ProjectAltWork {
  id: string;
  name: string;
  /** Fingerprints of images the audit says still need alt text. */
  wantedFingerprints: Set<string>;
  openFindings: number;
  /** The pages carrying them, most-shared first, so one fetch covers the most images. */
  pagesWithMissingAlt: { pageId: string; url: string; missing: number }[];
}

/**
 * What the audit already knows, reduced to "which images, on which pages".
 *
 * The audit findings say *which* images lack alt text; only the page itself
 * says what they mean. So this hands back the list and the CLI re-reads the
 * pages for context.
 */
export async function loadProjectForAltText(projectId: string): Promise<ProjectAltWork | null> {
  const ref = projectRef(projectId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const project = { id: snap.id, ...(snap.data() as Omit<Project, 'id'>) } as Project;

  const audits = await ref.collection(LINK_AUDITS).get();
  const auditById = new Map(audits.docs.map((d) => [d.id, d.data() as AuditResult]));
  const links: ProjectLink[] = (project.links ?? []).map((link) => {
    const audit = auditById.get(link.id);
    return audit ? { ...link, auditResult: audit } : link;
  });

  const decisionDocs = await ref.collection('audit_decisions').get();
  const decisions = decisionDocs.docs.map((d) => ({ ...(d.data() as Omit<AuditDecision, 'id'>), id: d.id }));

  const findings = collectFindings(links, decisions);
  const open = findings.alt.filter((f) => f.state === 'open' || f.state === 'regressed');

  const missingByPage = new Map<string, { pageId: string; url: string; missing: number }>();
  for (const finding of open) {
    for (const page of finding.pages) {
      const existing = missingByPage.get(page.pageId);
      if (existing) existing.missing += 1;
      else missingByPage.set(page.pageId, { pageId: page.pageId, url: page.url, missing: 1 });
    }
  }

  return {
    id: project.id,
    name: project.name,
    wantedFingerprints: new Set(open.map((f) => f.fingerprint)),
    openFindings: open.length,
    pagesWithMissingAlt: [...missingByPage.values()].sort((a, b) => b.missing - a.missing),
  };
}

export async function saveAltSuggestions(
  projectId: string,
  suggestions: AltSuggestion[],
): Promise<number> {
  const collection = projectRef(projectId).collection(ALT_SUGGESTIONS);
  let written = 0;

  for (let i = 0; i < suggestions.length; i += 400) {
    const batch = adminDb.batch();
    for (const suggestion of suggestions.slice(i, i + 400)) {
      const id = decisionId('alt', suggestion.fingerprint);
      const stored: Omit<StoredAltSuggestion, 'id'> = stripUndefined({
        fingerprint: suggestion.fingerprint,
        src: suggestion.src,
        kind: suggestion.kind,
        certainty: suggestion.certainty,
        alt: suggestion.alt,
        visibleText: suggestion.visibleText,
        longDescription: suggestion.longDescription,
        observation: suggestion.observation,
        needsReview: suggestion.needsReview,
        notes: suggestion.notes,
        agreement: suggestion.agreement,
        verified: suggestion.verified,
        model: suggestion.model,
        generatedAt: suggestion.generatedAt,
      });
      batch.set(collection.doc(id), { ...stored, updatedAt: AdminTimestamp.now() });
      written += 1;
    }
    await batch.commit();
  }

  return written;
}
