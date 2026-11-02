import type { ClientPortalView, PortalFileView } from './client-portal.types';

/** One link in the client page's sidebar: what it is, and where on the page it comes from. */
export interface PortalLinkView extends PortalFileView {
  /** The step it belongs to ("Moodboarding"), or nothing for a project-wide link. */
  note?: string;
  /** Its how-to (the MarkUp video), shown small beside it rather than as a link of its own. */
  help?: { label: string; url: string };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10 Sep" from YYYY-MM-DD, the same on every server whatever its locale data. */
function shortDay(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return MONTHS[month - 1] ? `${day} ${MONTHS[month - 1]}` : iso;
}

/**
 * Every link on the client's page in one place (Rehan, 2026-10-01: "all the
 * important links can be on the sidebar"): their website, each step's link
 * (the sitemap, the moodboard, the project sheet) in process order, the latest
 * version of each deliverable, then the files the team shared for the whole project. Nothing new is published here:
 * each of these is already on the page, opted in where it came from.
 */
export function portalLinks(view: Pick<ClientPortalView, 'websiteUrl' | 'stages' | 'files' | 'deliverables'>): PortalLinkView[] {
  const links: PortalLinkView[] = [];
  if (view.websiteUrl) links.push({ id: '__site', title: 'Your website', url: view.websiteUrl });
  for (const stage of view.stages) {
    for (const step of stage.steps ?? []) {
      if (!step.url) continue;
      const stepLinks = step.links ?? [{ label: step.urlLabel ?? '', url: step.url }];
      stepLinks.forEach((link, index) => {
        const title = link.label || step.title;
        links.push({
          id: index === 0 ? `step-${step.id}` : `step-${step.id}-${index}`,
          title,
          url: link.url,
          ...(title !== step.title ? { note: step.title } : {}),
          ...('help' in link && link.help ? { help: link.help } : {}),
        });
      });
    }
  }
  // The calls the team shared, newest first: what was said is as much a reference as the files.
  const calls = view.stages
    .flatMap((stage) => stage.meetings ?? [])
    .filter((m) => m.recordingUrl)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const call of calls) links.push({ id: `call-${call.id}`, title: call.title, url: call.recordingUrl!, note: `Call recording · ${new Date(call.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` });
  // What we handed over: the latest version of each, its version and day on the note line.
  for (const deliverable of view.deliverables ?? []) {
    const latest = deliverable.versions[0];
    if (!latest) continue;
    const note = ['Deliverable', latest.version ? `v${latest.version}` : '', latest.sharedAt ? `shared ${shortDay(latest.sharedAt)}` : ''].filter(Boolean).join(' · ');
    links.push({ id: `deliverable-${deliverable.id}`, title: latest.title, url: latest.url, note });
  }
  links.push(...view.files);
  // Once each, counting "site.webflow.io" and "site.webflow.io/" as the same place.
  const seen = new Set<string>();
  const key = (url: string) => url.replace(/\/+$/, '');
  return links.filter((l) => (seen.has(key(l.url)) ? false : (seen.add(key(l.url)), true)));
}
