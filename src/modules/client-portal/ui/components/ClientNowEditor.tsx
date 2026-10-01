'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClientPlanStage, ClientStatus, Project } from '@/types';
import { CLIENT_STATUS_TONES, TONE_CLASSES } from '@/lib/ui-tones';
import { cn } from '@/lib/utils';
import { PLAN_COMPLETE, planTracksChecklist, type ResolvedPlan } from '../../domain/client-plan';
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_PORTAL_LABELS,
  normalizeClientStatus,
} from '../../domain/client-portal.types';
import { ageLabel, daysSinceClientUpdate, isPortalStale } from '../../domain/client-status';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

const NOTE_MAX = 160;
/** The counter appears only once the note is close to the limit. */
const NOTE_WARN = 120;
const FOLLOW = '__follow__';

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
  /** '' follows the checklist. */
  currentStageId: string;
}

function sameDraft(a: Draft, b: Draft): boolean {
  // The note is trimmed on the way to Firestore, so compare it trimmed too:
  // otherwise typing a trailing space leaves Save lit with nothing to save.
  return a.status === b.status && a.statusNote.trim() === b.statusNote.trim() && a.currentStageId === b.currentStageId;
}

const SOURCE_NAME = { checklist: 'checklist', timeline: 'Timeline', sheet: 'project sheet' } as const;

/** "Kickoff · 14/19": where the source alone puts the project, for the Follow option. */
function followingLabel(following: ResolvedPlan | null): string {
  if (!following || following.stages.length === 0) return '';
  if (following.currentIndex < 0) return 'all done';
  const current = following.stages[following.currentIndex];
  const t = current.tracking;
  return t && t.total > 0 ? `${current.stage.title} · ${t.done}/${t.total}` : current.stage.title;
}

/** A line under the stage only when there is something to act on; the Follow option says the rest. */
function stageProblem(following: ResolvedPlan | null, source: keyof typeof SOURCE_NAME): string {
  if (source !== 'checklist' || !following || following.stages.length === 0) return '';
  if (!planTracksChecklist(following)) return 'No checklist tracks this plan: pick the stage by hand.';
  const current = following.currentIndex >= 0 ? following.stages[following.currentIndex] : undefined;
  if (current && !current.tracking) return `Nothing on the checklist tracks ${current.stage.title}: move it on by hand.`;
  return '';
}

interface ClientNowEditorProps {
  project: Pick<Project, 'id' | 'clientPortal' | 'clientFacing'>;
  /** Stages of the saved plan; null when there is none, so there is no stage to pick. */
  stages: ClientPlanStage[] | null;
  /** The plan following its source alone (checklist, Timeline or sheet), for the Follow option. */
  following: ResolvedPlan | null;
  userEmail: string;
  /** What the stages follow when nobody pins one. */
  followSource?: 'checklist' | 'timeline' | 'sheet';
}

/**
 * "Now": which stage the client sees the project in, its status, and one line
 * from the team. No optimistic state: the parent's live project subscription
 * delivers the saved values, and the draft only follows them while the form is
 * clean.
 */
export function ClientNowEditor({
  project,
  stages,
  following,
  userEmail,
  followSource = 'checklist',
}: ClientNowEditorProps) {
  const facing = project.clientFacing;
  const server = useMemo<Draft>(
    () => ({
      status: normalizeClientStatus(facing?.status),
      statusNote: facing?.statusNote ?? '',
      currentStageId: facing?.currentStageId ?? '',
    }),
    [facing?.status, facing?.statusNote, facing?.currentStageId],
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

  const pickable = stages ?? [];
  const knownPick =
    draft.currentStageId === PLAN_COMPLETE || pickable.some((s) => s.id === draft.currentStageId) ? draft.currentStageId : '';
  const stageValue = knownPick || FOLLOW;
  const followDetail = followingLabel(following);

  const days = daysSinceClientUpdate(facing);
  const stale = isPortalStale(project);
  const by = facing?.lastUpdateBy?.split('@')[0];
  const lastUpdated =
    days === null ? 'Never marked updated' : `Updated ${days <= 0 ? 'today' : `${ageLabel(days)} ago`}${by ? ` by ${by}` : ''}`;

  let stageHint = '';
  if (!stages) stageHint = 'Set up the plan below to show the client which stage the project is in.';
  else if (draft.status === 'delivered') stageHint = 'Delivered: the client sees every stage done.';
  else if (knownPick) stageHint = `Pinned by you. The ${SOURCE_NAME[followSource]} says ${followDetail || 'nothing yet'}.`;
  else stageHint = stageProblem(following, followSource);
  // The client's wording, only where it differs from ours ("Waiting on client" reads "Waiting on you").
  const clientWording =
    CLIENT_STATUS_PORTAL_LABELS[draft.status] !== CLIENT_STATUS_LABELS[draft.status]
      ? CLIENT_STATUS_PORTAL_LABELS[draft.status]
      : '';

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await clientPortalRepository.updateClientFacing(
        project.id,
        {
          status: draft.status,
          statusNote: draft.statusNote.trim() || null,
          ...(stages ? { currentStageId: knownPick || null } : {}),
        },
        userEmail,
        // An explicit Save in the Client tab is the team telling the client
        // something, so it refreshes the "last updated" stamp.
        { touch: true },
      );
      toast.success('Saved: the client sees it now');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUpdated = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await clientPortalRepository.markClientUpdated(project.id, userEmail);
      toast.success('Marked as updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark updated');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`client-stage-${project.id}`} className="text-xs text-muted-foreground">Stage</Label>
          <Select
            value={stageValue}
            onValueChange={(v) => setDraft((d) => ({ ...d, currentStageId: v === FOLLOW ? '' : v }))}
            disabled={!stages || stages.length === 0}
          >
            <SelectTrigger id={`client-stage-${project.id}`} size="sm" className="w-full text-xs">
              <SelectValue placeholder="No plan yet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FOLLOW} className="text-xs">
                Follow the {SOURCE_NAME[followSource]}
                {followDetail ? ` (${followDetail})` : ''}
              </SelectItem>
              {pickable.map((stage, index) => (
                <SelectItem key={stage.id} value={stage.id} className="text-xs">
                  {index + 1}. {stage.title}
                </SelectItem>
              ))}
              <SelectItem value={PLAN_COMPLETE} className="text-xs">Every stage done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`client-status-${project.id}`} className="text-xs text-muted-foreground">Status</Label>
          <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as ClientStatus }))}>
            <SelectTrigger id={`client-status-${project.id}`} size="sm" className="w-full text-xs">
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
        </div>
      </div>

      {(stageHint || clientWording) && (
        <p className="text-[11px] text-muted-foreground">
          {stageHint}
          {stageHint && clientWording ? ' ' : ''}
          {clientWording && (
            <>
              The client reads the status as <span className="text-foreground">{clientWording}</span>.
            </>
          )}
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor={`client-note-${project.id}`} className="text-xs text-muted-foreground">Note for the client</Label>
          {draft.statusNote.length >= NOTE_WARN && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{draft.statusNote.length}/{NOTE_MAX}</span>
          )}
        </div>
        <Input
          id={`client-note-${project.id}`}
          value={draft.statusNote}
          maxLength={NOTE_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, statusNote: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
          }}
          placeholder="e.g. Homepage and About are on staging for your review."
          className="h-8 text-sm"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-xs', stale ? 'text-amber-700 dark:text-amber-300/90' : 'text-muted-foreground')}>{lastUpdated}</p>
        {/* One button: Save while there are changes; otherwise Mark updated, which
            tells the client nothing changed but the page is current. */}
        {dirty ? (
          <Button size="sm" className="h-8 text-xs" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleMarkUpdated()}
            disabled={marking}
            title="Nothing to change: stamp the client's page as up to date"
          >
            {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark updated
          </Button>
        )}
      </div>
    </div>
  );
}
