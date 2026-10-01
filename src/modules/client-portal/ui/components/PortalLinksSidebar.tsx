import { Globe } from 'lucide-react';
import type { ClientPortalView } from '../../domain/client-portal.types';
import { portalLinks } from '../../domain/portal-links';
import { PortalFileList } from './PortalFileList';

/**
 * The client's links beside the page on wide screens, in view while they
 * scroll: the website, each step's link and the shared files. On a phone the
 * same links stay inline on the steps and under "Files & links".
 */
export function PortalLinksSidebar({ view }: { view: Pick<ClientPortalView, 'websiteUrl' | 'stages' | 'files'> }) {
  const links = portalLinks(view).map((l) => (l.id === '__site' ? { ...l, icon: Globe } : l));
  if (links.length === 0) return null;
  return (
    <aside aria-labelledby="portal-links-heading" className="space-y-3">
      <h2 id="portal-links-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Links
      </h2>
      <PortalFileList files={links} compact />
    </aside>
  );
}
