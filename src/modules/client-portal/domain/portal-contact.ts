import type { Project } from '@/types';

/**
 * Who the client is told to talk to, kept apart from who owns the project
 * inside the team (ACT-95, 2026-11-02). The two used to be one field: the
 * portal showed the project lead, so a project led by one person but fronted
 * by another showed the client the wrong name.
 *
 *   - Client point of contact: `clientPortal.agencyContactEmail`. Shown to
 *     the client (portal footer, the app-kept sheet's "Project lead").
 *   - Internal owners: `reviewOwnerEmail` (the lead) and `assigneeEmails` (the
 *     team), set with the people picker. Team only.
 *
 * A project that has never set a point of contact falls back to the lead,
 * then the first of the team, which is exactly what the portal showed before,
 * so nothing changes for a project until someone picks a contact.
 */
export type PortalContactSource = 'set' | 'lead' | 'team' | 'none';

export interface PortalContact {
  email?: string;
  source: PortalContactSource;
}

type ContactProject = Pick<Project, 'reviewOwnerEmail' | 'assigneeEmails'> & {
  clientPortal?: { agencyContactEmail?: string } | null;
};

function clean(email: string | undefined | null): string | undefined {
  const trimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return trimmed.includes('@') ? trimmed : undefined;
}

export function portalContact(project: ContactProject): PortalContact {
  const set = clean(project.clientPortal?.agencyContactEmail);
  if (set) return { email: set, source: 'set' };
  const lead = clean(project.reviewOwnerEmail);
  if (lead) return { email: lead, source: 'lead' };
  const team = (project.assigneeEmails ?? []).map(clean).find(Boolean);
  if (team) return { email: team, source: 'team' };
  return { source: 'none' };
}

/** The internal owners, lead first, deduplicated. Team only: never put these in a client payload. */
export function internalOwners(project: Pick<Project, 'reviewOwnerEmail' | 'assigneeEmails'>): string[] {
  const all = [project.reviewOwnerEmail, ...(project.assigneeEmails ?? [])].map(clean).filter((e): e is string => !!e);
  return [...new Set(all)];
}
