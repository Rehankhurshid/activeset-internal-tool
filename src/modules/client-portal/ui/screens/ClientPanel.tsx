'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, ProjectTimeline } from '@/types';
import { cn } from '@/lib/utils';
import type { PortalLinkState } from '../../infrastructure/client-portal.repository';
import { ClientStatusChip } from '../components/ClientStatusChip';
import { ClientStatusEditor } from '../components/ClientStatusEditor';
import { PortalBrandingFields } from '../components/PortalBrandingFields';
import { PortalLinkCard } from '../components/PortalLinkCard';
import { PortalVisibilityLists } from '../components/PortalVisibilityLists';

interface ClientPanelProps {
  project: Project;
  timeline: ProjectTimeline | null;
  userEmail: string;
  /** Reserved for admin-only controls (client contacts / per-contact links) in the next phase. */
  isAdmin: boolean;
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <CardTitle className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </CardTitle>
  );
}

/**
 * Internal "Client" tab: the portal link, what the client is told, what they
 * can see, and how the page is branded. Everything reads from the live
 * project doc the detail screen already subscribes to.
 */
export function ClientPanel(props: ClientPanelProps) {
  const { project, timeline, userEmail } = props;
  const [link, setLink] = useState<PortalLinkState | null>(null);
  const enabled = link ? link.enabled : project.clientPortal?.enabled === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Client portal</h2>
        <ClientStatusChip project={project} size="md" />
        {!enabled && (
          <span className="text-xs text-muted-foreground">Off — the client cannot see anything until the portal is enabled.</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Portal link</SectionTitle>
              <CardDescription className="text-xs">
                A private, sign-in-free page showing status, plan and deliverables.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalLinkCard projectId={project.id} project={project} onStateChange={setLink} />
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Status the client sees</SectionTitle>
              <CardDescription className="text-xs">
                Saving or “Mark updated” refreshes the freshness stamp on the portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientStatusEditor project={project} phases={timeline?.phases ?? []} userEmail={userEmail} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>What the client can see</SectionTitle>
              <CardDescription className="text-xs">
                Only switched-on milestones (title, dates, status) and links reach the portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalVisibilityLists projectId={project.id} timeline={timeline} links={project.links} />
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <SectionTitle>Branding</SectionTitle>
              <CardDescription className="text-xs">Header copy on the portal page.</CardDescription>
            </CardHeader>
            <CardContent>
              <PortalBrandingFields project={project} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
