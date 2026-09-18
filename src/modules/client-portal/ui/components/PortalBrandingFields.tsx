'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/types';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

const WELCOME_MAX = 140;

interface Draft {
  brandName: string;
  welcome: string;
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.brandName === b.brandName && a.welcome === b.welcome;
}

interface PortalBrandingFieldsProps {
  project: Pick<Project, 'id' | 'name' | 'client' | 'clientPortal'>;
}

/** Header copy for the portal: brand name and a one-line welcome. */
export function PortalBrandingFields({ project }: PortalBrandingFieldsProps) {
  const settings = project.clientPortal;
  const server = useMemo<Draft>(
    () => ({ brandName: settings?.brandName ?? '', welcome: settings?.welcome ?? '' }),
    [settings?.brandName, settings?.welcome],
  );

  const [draft, setDraft] = useState<Draft>(server);
  const lastServer = useRef(server);
  useEffect(() => {
    const prev = lastServer.current;
    lastServer.current = server;
    setDraft((d) => (sameDraft(d, prev) ? server : d));
  }, [server]);

  const dirty = !sameDraft(draft, server);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await clientPortalRepository.updateClientPortalSettings(project.id, {
        brandName: draft.brandName.trim() || null,
        welcome: draft.welcome.trim() || null,
      });
      toast.success('Portal branding saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="portal-brand" className="text-xs text-muted-foreground">Brand name</Label>
        <Input
          id="portal-brand"
          value={draft.brandName}
          onChange={(e) => setDraft((d) => ({ ...d, brandName: e.target.value }))}
          placeholder={project.client || project.name}
          maxLength={80}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="portal-welcome" className="text-xs text-muted-foreground">Welcome line</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{draft.welcome.length}/{WELCOME_MAX}</span>
        </div>
        <Input
          id="portal-welcome"
          value={draft.welcome}
          onChange={(e) => setDraft((d) => ({ ...d, welcome: e.target.value }))}
          placeholder="One line the client sees under the project name"
          maxLength={WELCOME_MAX}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Logo comes from the project logo (set it from the project card).</p>
        <Button size="sm" className="h-8 text-xs" onClick={() => void handleSave()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}
