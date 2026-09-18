'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Project } from '@/types';
import { cn } from '@/lib/utils';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

interface PortalRepliesToggleProps {
  project: Pick<Project, 'id' | 'clientPortal'>;
}

/**
 * Whether the client's page shows a message box. Unset means on, so an older
 * project doc that predates the setting behaves the way the portal does.
 */
export function PortalRepliesToggle({ project }: PortalRepliesToggleProps) {
  const open = project.clientPortal?.repliesOpen !== false;
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: boolean) => {
    setSaving(true);
    try {
      await clientPortalRepository.updateClientPortalSettings(project.id, { repliesOpen: next });
      toast.success(next ? 'The client can reply' : 'Replies are off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update replies');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-3">
      <Switch
        id="portal-replies-open"
        checked={open}
        disabled={saving}
        onCheckedChange={(next) => void handleChange(next)}
      />
      <div className={cn('min-w-0 flex-1', saving && 'opacity-60')}>
        <Label htmlFor="portal-replies-open" className="cursor-pointer text-sm">
          Let the client reply
        </Label>
        <p className="text-[11px] text-muted-foreground">Turns the message box on their page on or off.</p>
      </div>
    </div>
  );
}
