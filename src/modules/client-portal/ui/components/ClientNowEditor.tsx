'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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

/** What the checklist alone says, in a sentence the team can check against the Delivery tab. */
function checklistSays(following: ResolvedPlan | null): string {
  if (!following || following.stages.length === 0) return '';
  if (!planTracksChecklist(following)) {
    return 'No checklist tracks this plan, so move the stage on by hand. Add a checklist and rebuild the plan to make it follow along.';
  }
  if (following.currentIndex < 0) return 'The checklist says every stage is done.';
  const current = following.stages[following.currentIndex];
  if (!current.tracking) {
    return `The checklist puts the project in ${current.stage.title}, which nothing in it tracks: move it on by hand.`;
  }
  return `The checklist puts the project in ${current.stage.title}: ${current.tracking.done} of ${current.tracking.total} steps ticked.`;
}

interface ClientNowEditorProps {
  project: Pick<Project, 'id' | 'clientPortal' | 'clientFacing'>;
  /** Stages of the saved plan; null when there is none, so there is no stage to pick. */
  stages: ClientPlanStage[] | null;
  /** The plan as the client sees it, the team's pick included. */
  resolved: ResolvedPlan | null;
  /** The same plan following the checklist alone. */
  following: ResolvedPlan | null;
  userEmail: string;
}

/**
 * "Now": which stage the client sees the project in, its status, and one line
 * from the team. No optimistic state: the parent's live project subscription
 * delivers the saved values, and the draft only follows them while the form is
 * clean.
 */
export function ClientNowEditor({ project, stages, resolved, following, userEmail }: ClientNowEditorProps) {
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
  const [advancing, setAdvancing] = useState(false);

  const pickable = stages ?? [];
  const knownPick =
    draft.currentStageId === PLAN_COMPLETE || pickable.some((s) => s.id === draft.currentStageId) ? draft.currentStageId : '';
  const stageValue = knownPick || FOLLOW;
  const followingTitle =
    following && following.currentIndex >= 0 ? following.stages[following.currentIndex]?.stage.title : undefined;

  const days = daysSinceClientUpdate(facing);
  const stale = isPortalStale(project);
  const lastUpdated =
    days === null
      ? 'Never marked updated'
      : `Last updated ${ageLabel(days)}${facing?.lastUpdateBy ? ` by ${facing.lastUpdateBy}` : ''}`;

  // "Next stage" moves on from the stage the client sees now.
  const currentIndex = resolved?.currentIndex ?? -1;
  const nextStage = stages && currentIndex >= 0 ? stages[currentIndex + 1] : undefined;
  const next =
    stages && currentIndex >= 0
      ? nextStage
        ? { id: nextStage.id, label: `Move to ${nextStage.title}`, done: `${nextStage.title} is the current stage` }
        : { id: PLAN_COMPLETE, label: 'Mark every stage done', done: 'Every stage marked done' }
      : null;

  let stageHint = '';
  if (!stages) stageHint = 'Set up the plan below to show the client which stage the project is in.';
  else if (draft.status === 'delivered') stageHint = 'Delivered: the client sees every stage done.';
  else if (!knownPick) stageHint = checklistSays(following);
  else stageHint = `Pinned by you. ${checklistSays(following)}`.trim();

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

  const handleNext = async () => {
    if (!next || advancing || dirty) return;
    setAdvancing(true);
    try {
      await clientPortalRepository.updateClientFacing(project.id, { currentStageId: next.id }, userEmail, { touch: true });
      toast.success(next.done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move the stage on');
    } finally {
      setAdvancing(false);
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`client-stage-${project.id}`} className="text-xs text-muted-foreground">Stage the client sees</Label>
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <Select
            value={stageValue}
            onValueChange={(v) => setDraft((d) => ({ ...d, currentStageId: v === FOLLOW ? '' : v }))}
            disabled={!stages || stages.length === 0}
          >
            <SelectTrigger id={`client-stage-${project.id}`} size="sm" className="w-full text-xs sm:flex-1">
              <SelectValue placeholder="No plan yet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FOLLOW} className="text-xs">
                Follow the checklist{followingTitle ? ` (${followingTitle})` : ''}
              </SelectItem>
              {pickable.map((stage, index) => (
                <SelectItem key={stage.id} value={stage.id} className="text-xs">
                  {index + 1}. {stage.title}
                </SelectItem>
              ))}
              <SelectItem value={PLAN_COMPLETE} className="text-xs">Every stage done</SelectItem>
            </SelectContent>
          </Select>
          {next && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void handleNext()}
              disabled={advancing || dirty || saving}
              title={dirty ? 'Save or undo your changes first' : undefined}
            >
              {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              {next.label}
            </Button>
          )}
        </div>
        {stageHint && <p className="text-[11px] text-muted-foreground">{stageHint}</p>}
      </div>

      <div className="space-y-1.5">
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
        <p className="text-[11px] text-muted-foreground">
          Client sees: <span className="text-foreground">{CLIENT_STATUS_PORTAL_LABELS[draft.status]}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`client-note-${project.id}`} className="text-xs text-muted-foreground">What&apos;s going on (one line)</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">{draft.statusNote.length}/{NOTE_MAX}</span>
        </div>
        <Textarea
          id={`client-note-${project.id}`}
          value={draft.statusNote}
          maxLength={NOTE_MAX}
          onChange={(e) => setDraft((d) => ({ ...d, statusNote: e.target.value }))}
          placeholder="e.g. “Homepage and About are on staging for your review.”"
          className="min-h-14 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('text-xs', stale ? 'text-amber-700 dark:text-amber-300/90' : 'text-muted-foreground')}>{lastUpdated}</p>
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
