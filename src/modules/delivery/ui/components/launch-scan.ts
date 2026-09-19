import type { AuditResult, ChecklistItem, Project } from '@/types';
import { resolveAutoCheck } from '../../domain/delivery.progress';
import type { AutoCheckVerdict, ProjectPage } from '../../domain/delivery.types';
import { normalizePagePath } from '../../infrastructure/delivery.repository';

/**
 * What the page scans make of the work, for the stages that ask.
 *
 * Kept out of the screens because two of them need it: the stage's items want a
 * hint beside them, and launch readiness wants the same scans per page.
 */

/** Page checks resolved per page need the scan for that page, matched by path. */
export function buildAuditsByPageId(
  project: Project,
  pages: ProjectPage[],
): Record<string, AuditResult | undefined> {
  const byPath = new Map<string, { audit: AuditResult; auto: boolean }>();
  for (const link of project.links ?? []) {
    if (!link.url || !link.auditResult) continue;
    const path = normalizePagePath(link.url);
    const auto = link.source === 'auto';
    const existing = byPath.get(path);
    // Discovered links are the scanned ones; a manual link only stands in when
    // nothing discovered covers that path.
    if (!existing || (auto && !existing.auto)) byPath.set(path, { audit: link.auditResult, auto });
  }

  const result: Record<string, AuditResult | undefined> = {};
  for (const page of pages) {
    result[page.id] = byPath.get(normalizePagePath(page.path))?.audit;
  }
  return result;
}

/**
 * What the page scans make of each checklist item that names one.
 *
 * Such an item is asked of the whole site, so the pages are read together: one
 * page that would fail is enough to say the site would, and a site where nothing
 * has been scanned gets no verdict at all rather than a reassuring pass. This is
 * a hint beside the item — nothing here answers it, because the person ticking
 * it is the one signing it off.
 */
export function buildAutoVerdicts(
  items: Pick<ChecklistItem, 'id' | 'autoCheck'>[],
  pages: ProjectPage[],
  auditsByPageId: Record<string, AuditResult | undefined>,
): Record<string, AutoCheckVerdict> {
  const verdicts: Record<string, AutoCheckVerdict> = {};
  const scanned = pages.filter((page) => auditsByPageId[page.id]);
  if (scanned.length === 0) return verdicts;

  for (const item of items) {
    if (!item.autoCheck) continue;
    let answered = 0;
    let failing = 0;
    for (const page of scanned) {
      const verdict = resolveAutoCheck(item.autoCheck, auditsByPageId[page.id]);
      if (verdict === 'unknown') continue;
      answered += 1;
      if (verdict === 'fail') failing += 1;
    }
    if (answered === 0) continue;
    verdicts[item.id] = failing > 0 ? 'fail' : 'pass';
  }
  return verdicts;
}
