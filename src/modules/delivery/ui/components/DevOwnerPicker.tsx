'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAssignees } from '@/hooks/useAssignees';
import type { Project } from '@/types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

interface DevOwnerPickerProps {
  project: Project;
  userEmail: string;
}

/** Who receives the every-two-days dev nudge for this project's delivery work. */
export function DevOwnerPicker({ project, userEmail }: DevOwnerPickerProps) {
  const { assignees } = useAssignees();
  const options = useMemo(() => {
    const emails = new Set<string>();
    for (const a of assignees) emails.add(a.toLowerCase());
    for (const e of project.assigneeEmails ?? []) emails.add(e.toLowerCase());
    emails.add(userEmail.toLowerCase());
    return [...emails].sort();
  }, [assignees, project.assigneeEmails, userEmail]);

  const value = project.delivery?.devOwnerEmail?.toLowerCase() ?? '';

  const onChange = async (email: string) => {
    try {
      await deliveryRepository.setDevOwnerEmail(project.id, email);
      toast.success('Dev owner saved for delivery nudges');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save dev owner');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Dev nudges</span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Dev owner for delivery nudges">
          <SelectValue placeholder="Pick dev owner…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((email) => (
            <SelectItem key={email} value={email} className="text-xs">
              {email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
