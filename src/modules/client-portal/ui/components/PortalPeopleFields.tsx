'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectPeoplePicker } from '@/components/projects/ProjectPeoplePicker';
import { useAssignees } from '@/hooks/useAssignees';
import type { Project } from '@/types';
import { internalOwners, portalContact } from '../../domain/portal-contact';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

/** Select value for "nobody chosen": the page falls back to the lead. */
const FALLBACK = '__fallback__';

interface PortalPeopleFieldsProps {
  project: Pick<Project, 'id' | 'name' | 'reviewOwnerEmail' | 'assigneeEmails' | 'clientPortal'>;
}

/**
 * Who the client talks to, apart from who owns the project inside the team
 * (ACT-95). The first is shown to the client; the second never is, except
 * that a project with no point of contact chosen still shows its lead, as it
 * always did.
 */
export function PortalPeopleFields({ project }: PortalPeopleFieldsProps) {
  const { assignees } = useAssignees();
  const [saving, setSaving] = useState(false);
  const owners = internalOwners(project);
  const contact = portalContact(project);
  const chosen = contact.source === 'set' ? contact.email! : FALLBACK;

  // The project's own people first, then the rest of the team.
  const options = [
    ...new Set(
      [...(contact.source === 'set' && contact.email ? [contact.email] : []), ...owners, ...assignees.map((e) => e.trim().toLowerCase())].filter(
        (e) => e.includes('@'),
      ),
    ),
  ];

  // What the page shows when nobody is chosen: the lead, else the first of the team.
  const fallback = portalContact({ ...project, clientPortal: undefined });
  const fallbackLabel = fallback.email
    ? `${fallback.source === 'lead' ? 'Project lead' : 'First of the team'} (${fallback.email})`
    : 'Nobody';

  const handleChange = async (value: string) => {
    if (saving || value === chosen) return;
    setSaving(true);
    try {
      await clientPortalRepository.updateClientPortalSettings(project.id, {
        agencyContactEmail: value === FALLBACK ? null : value,
      });
      toast.success(value === FALLBACK ? 'The client page shows the project lead again' : `The client page now shows ${value}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the point of contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="portal-point-of-contact" className="text-xs text-muted-foreground">
          Client point of contact
        </Label>
        <div className="flex items-center gap-2">
          <Select value={chosen} onValueChange={(v) => void handleChange(v)} disabled={saving}>
            <SelectTrigger id="portal-point-of-contact" className="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FALLBACK}>{fallbackLabel}</SelectItem>
              {options.map((email) => (
                <SelectItem key={email} value={email}>
                  {email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Shown to the client: the page&apos;s footer and the project sheet&apos;s lead.
          {contact.source !== 'set' && contact.email ? ` Today that is ${contact.email}.` : ''}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Internal owners</p>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectPeoplePicker
            projectId={project.id}
            projectName={project.name}
            assigneeEmails={project.assigneeEmails}
            reviewOwnerEmail={project.reviewOwnerEmail}
          />
          {project.reviewOwnerEmail && (
            <span className="truncate text-xs text-muted-foreground">Lead: {project.reviewOwnerEmail}</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Team only. The client never sees these unless no point of contact is chosen.</p>
      </div>
    </div>
  );
}
