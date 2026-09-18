'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ClientStatus, Project, TimelinePhase } from '@/types';
import { CLIENT_STATUS_TONES, TONE_CLASSES } from '@/lib/ui-tones';
import { cn } from '@/lib/utils';
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_PORTAL_LABELS,
  normalizeClientStatus,
} from '../../domain/client-portal.types';
import { ageLabel, daysSinceClientUpdate, isPortalStale } from '../../domain/client-status';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

const NOTE_MAX = 160;
const AUTO_PHASE = '__auto__';

/** Just the text-colour classes of a tone, for a `bg-current` dot. */
function toneText(status: ClientStatus): string {
  return TONE_CLASSES[CLIENT_STATUS_TONES[status]]
    .split(' ')
    .filter((c) => c.includes('text-'))
    .join(' ');
}

interface Draft {
  status: ClientStatus;
  statusNote: string;
  currentPhaseId: string;
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.status === b.status && a.statusNote === b.statusNote && a.currentPhaseId === b.currentPhaseId;
}

interface ClientStatusEditorProps {
  project: Pick<Project, 'id' | 'clientPortal' | 'clientFacing'>;
  /** Timeline phases (any order); the "current phase" picker sorts them. */
  phases: TimelinePhase[];
  userEmail: string;
}

/**
 * What the client sees as the project's status. No optimistic state: the
 * parent's live project subscription delivers the saved values, and the draft
 * only follows them while the form is clean.
 */
export function ClientStatusEditor({ project, phases, userEmail }: ClientStatusEditorProps) {
  const facing = project.clientFacing;
  const server = useMemo<Draft>(
    () => ({
      status: normalizeClientStatus(facing?.status),
      statusNote: facing?.statusNote ?? '',
      currentPhaseId: facing?.currentPhaseId ?? '',
    }),
    [facing?.status, facing?.statusNote, facing?.currentPhaseId],
  );

  const [draft, setDraft] = useState<Draft>(server);
  const lastServer = useRef(server);
  useEffect(() => {
    const prev = lastServer.current;
    lastServer.current = server;
    // Follow the live doc only when the form has not diverged from the values it was seeded with.
    setDraft((d) => (sameDraft(d, prev) ? server : d));
  }, [server]);

  const dirty = !sameDraft(draft, server);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);

  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const phaseValue = sortedPhases.some((p) => p.id === draft.currentPhaseId) ? draft.currentPhaseId : AUTO_PHASE;

  const days = daysSinceClientUpdate(facing);
  const stale = isPortalStale(project);
  const lastUpdated = days === null
    ? 'Never marked updated'
    : `Last updated ${ageLabel(days)}${facing?.lastUpdateBy ? ` by ${facing.lastUpdateBy}` : ''}`;

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await clientPortalRepository.updateClientFacing(
        project.id,
        {
          status: draft.status,
          statusNote: draft.statusNote.trim() || null,
          currentPhaseId: draft.currentPhaseId || null,
        },
        userEmail,
      );
      toast.success('Client status saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save client status');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUpdated = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await clientPortalRepository.markClientUpdated(project.id, userEmail);
      toast.success('Portal marked as updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark updated');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="client-status" className="text-xs text-muted-foreground">Status</Label>
          <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as ClientStatus }))}>
            <SelectTrigger id="client-status" size="sm" className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  <span className={cn('inline-block h-1.5 w-1.5 rounded-full bg-current', toneText(s))} aria-hidden="true" />
                  {CLIENT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Client sees: <span className="text-foreground">{CLIENT_STATUS_PORTAL_LABELS[draft.status]}</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="client-phase" className="text-xs text-muted-foreground">Current phase</Label>
          <Select
            value={phaseValue}
            onValueChange={(v) => setDraft((d) => ({ ...d, currentPhaseId: v === AUTO_PHASE ? '' : v }))}
            disabled={sortedPhases.length === 0}
          >
            <SelectTrigger id="client-phase" size="sm" className="w-full text-xs">
              <SelectValue placeholder="Automatic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_PHASE} className="text-xs">Automatic</SelectItem>
              {sortedPhases.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {sortedPhases.length === 0
              ? 'Add phases to the timeline to pick one.'
              : 'Automatic picks the first phase with an unfinished client-visible milestone.'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="client-note" className="text-xs text-muted-foreground">Note to client</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{draft.statusNote.length}/{NOTE_MAX}</span>
        </div>
        <Textarea
          id="client-note"
          value={draft.statusNote}
          maxLength={NOTE_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, statusNote: e.target.value }))}
          placeholder="One line under the status, e.g. “Design review scheduled for Thursday.”"
          className="min-h-14 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('text-xs', stale ? 'text-amber-700 dark:text-amber-300/90' : 'text-muted-foreground')}>
          {lastUpdated}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleMarkUpdated()}
            disabled={marking || saving}
            title="Refresh the freshness stamp the client sees without changing anything"
          >
            {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark updated
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => void handleSave()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
