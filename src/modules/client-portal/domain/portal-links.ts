import type { ClientPortalView, PortalFileView } from './client-portal.types';

/** One link in the client page's sidebar: what it is, and where on the page it comes from. */
export interface PortalLinkView extends PortalFileView {
  /** The step it belongs to ("Moodboarding"), or nothing for a project-wide link. */
  note?: string;
}

/**
 * Every link on the client's page in one place (Rehan, 2026-10-01: "all the
 * important links can be on the sidebar"): their website, each step's link
 * (the sitemap, the moodboard, the project sheet) in process order, then the
 * files the team shared for the whole project. Nothing new is published here:
 * each of these is already on the page, opted in where it came from.
 */
export function portalLinks(view: Pick<ClientPortalView, 'websiteUrl' | 'stages' | 'files'>): PortalLinkView[] {
  const links: PortalLinkView[] = [];
  if (view.websiteUrl) links.push({ id: '__site', title: 'Your website', url: view.websiteUrl });
  for (const stage of view.stages) {
    for (const step of stage.steps ?? []) {
      if (!step.url) continue;
      const title = step.urlLabel || step.title;
      links.push({ id: `step-${step.id}`, title, url: step.url, ...(title !== step.title ? { note: step.title } : {}) });
    }
  }
  links.push(...view.files);
  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)));
}
