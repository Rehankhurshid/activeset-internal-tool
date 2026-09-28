'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ClientPlanStage, MeetingShareStatus, ProjectMeeting } from '@/types';
import { cn } from '@/lib/utils';
import { normalizeMeetingDomain, stageForDate } from '../../domain/client-timeline';
import { clientPortalRepository, type MeetingsState } from '../../infrastructure/client-portal.repository';
import { PortalSummary } from './PortalSummary';
import { formatDuration, formatMeetingDay } from './portal-format';

type StageRef = Pick<ClientPlanStage, 'id' | 'title' | 'startDate' | 'dueDate'>;

const STATUS: Record<MeetingShareStatus, { label: string; className: string }> = {
  pending: { label: 'To review', className: 'border-amber-500/40 text-amber-700 dark:text-amber-300' },
  shared: { label: 'Shared', className: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' },
  hidden: { label: 'Not shared', className: 'text-muted-foreground' },
};

function durationOf(meeting: ProjectMeeting): string {
  const start = Date.parse(meeting.startedAt);
  const end = meeting.endedAt ? Date.parse(meeting.endedAt) : NaN;
  return end > start ? formatDuration(Math.round((end - start) / 60_000)) : '';
}

interface ReviewProps {
  meeting: ProjectMeeting;
  stages: StageRef[];
  projectId: string;
  onClose: () => void;
  onSaved: (meeting: ProjectMeeting) => void;
}

/**
 * Reading a call before the client does: Fathom's summary and action items,
 * the stage it is filed under, and an optional rewrite of what the client
 * reads. Share is the only way anything here reaches the client.
 */
function MeetingReview({ meeting, stages, projectId, onClose, onSaved }: ReviewProps) {
  const [summary, setSummary] = useState(meeting.clientSummary ?? meeting.summary ?? '');
  const [phaseId, setPhaseId] = useState(
    meeting.phaseId && stages.some((s) => s.id === meeting.phaseId)
      ? meeting.phaseId
      : (stageForDate(stages, meeting.startedAt) ?? ''),
  );
  const [busy, setBusy] = useState<MeetingShareStatus | 'save' | null>(null);
  const now = useMemo(() => new Date(), []);
  const edited = summary.trim() !== (meeting.clientSummary ?? meeting.summary ?? '').trim();
  const moved = !!phaseId && phaseId !== meeting.phaseId;

  const save = async (status?: MeetingShareStatus) => {
    setBusy(status ?? 'save');
    try {
      const patch: Parameters<typeof clientPortalRepository.updateMeeting>[2] = {};
      if (status) patch.status = status;
      if (moved) patch.phaseId = phaseId;
      if (edited) patch.clientSummary = summary.trim() === (meeting.summary ?? '').trim() ? null : summary;
      const saved = await clientPortalRepository.updateMeeting(projectId, meeting.id, patch);
      onSaved(saved);
      toast.success(
        status === 'shared' ? 'Shared: the client sees it now' : status === 'hidden' ? 'Kept off the client’s page' : 'Saved',
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const people = meeting.attendees.filter((a) => a.name || a.email);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="pr-6">{meeting.title}</DialogTitle>
        <DialogDescription>
          {[formatMeetingDay(meeting.startedAt, now), durationOf(meeting)].filter(Boolean).join(' · ')}
          {meeting.fathomUrl && (
            <>
              {' · '}
              <a href={meeting.fathomUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Open in Fathom
              </a>
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {people.length > 0 && (
          <p className="text-xs text-muted-foreground">
            With {people.map((p) => p.name ?? p.email).join(', ')}. The client sees names only.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`meeting-stage-${meeting.id}`} className="text-xs text-muted-foreground">
            Stage
          </Label>
          <Select value={phaseId} onValueChange={setPhaseId}>
            <SelectTrigger id={`meeting-stage-${meeting.id}`} size="sm" className="w-full text-xs">
              <SelectValue placeholder="Pick a stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id} className="text-xs">
                  {stage.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`meeting-summary-${meeting.id}`} className="text-xs text-muted-foreground">
              Summary the client reads
            </Label>
            {meeting.clientSummary && meeting.summary && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline"
                onClick={() => setSummary(meeting.summary ?? '')}
              >
                Back to Fathom’s
              </button>
            )}
          </div>
          {meeting.summary || meeting.clientSummary ? (
            <Textarea
              id={`meeting-summary-${meeting.id}`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-48 font-mono text-xs"
            />
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Fathom hasn’t finished the summary yet. It appears here within the hour.
            </p>
          )}
          {summary.trim() && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">How the client sees it</summary>
              <PortalSummary markdown={summary} className="pt-3" />
            </details>
          )}
        </div>

        {meeting.actionItems.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs text-muted-foreground">Next steps (from Fathom)</h4>
            <ul className="space-y-1 text-sm">
              {meeting.actionItems.map((item, i) => (
                <li key={i}>
                  {item.text}
                  {item.owner && <span className="text-muted-foreground"> — {item.owner}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void save('hidden')}
          disabled={!!busy || meeting.status === 'hidden'}
        >
          {busy === 'hidden' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Don’t share
        </Button>
        <div className="flex gap-2">
          {meeting.status === 'shared' && (
            <Button variant="outline" size="sm" onClick={() => void save()} disabled={!!busy || (!edited && !moved)}>
              {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
          )}
          {meeting.status !== 'shared' && (
            <Button size="sm" onClick={() => void save('shared')} disabled={!!busy || !phaseId}>
              {busy === 'shared' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Share with client
            </Button>
          )}
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

/** Which email domains' calls belong here, editable in one line. */
function DomainsLine({
  projectId,
  domains,
  userEmail,
  onSaved,
}: {
  projectId: string;
  domains: string[];
  userEmail: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(domains.join(', '));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const next = value
      .split(/[\s,]+/)
      .map(normalizeMeetingDomain)
      .filter((d): d is string => d !== null);
    setBusy(true);
    try {
      await clientPortalRepository.setMeetingDomains(projectId, next, userEmail);
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <p className="text-xs text-muted-foreground">
        Calls with anyone from{' '}
        <span className="text-foreground">{domains.length ? domains.join(', ') : 'no client domain yet'}</span>{' '}
        <button type="button" className="underline" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
    );
  }
  return (
    <form
      className="flex flex-col gap-1.5 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="assetplus.io, assetplus.in"
        aria-label="Client email domains"
        className="h-8 text-xs"
      />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface ClientMeetingsCardProps {
  projectId: string;
  /** The stages the client sees (Timeline phases or plan stages), for filing calls. */
  stages: StageRef[];
  userEmail: string;
}

/**
 * Calls from Fathom, filed by stage. Each arrives "To review"; the client sees
 * one only after someone opens it and presses Share.
 */
export function ClientMeetingsCard({ projectId, stages, userEmail }: ClientMeetingsCardProps) {
  const [state, setState] = useState<MeetingsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<ProjectMeeting | null>(null);
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    try {
      setState(await clientPortalRepository.listMeetings(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load calls');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await clientPortalRepository.syncMeetings(projectId);
      toast.success(result.added ? `${result.added} new call${result.added === 1 ? '' : 's'} to review` : 'No new calls');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check Fathom');
    } finally {
      setSyncing(false);
    }
  };

  const byStage = useMemo(() => {
    const groups = new Map<string, ProjectMeeting[]>();
    const ids = new Set(stages.map((s) => s.id));
    for (const meeting of state?.meetings ?? []) {
      const id = meeting.phaseId && ids.has(meeting.phaseId) ? meeting.phaseId : stageForDate(stages, meeting.startedAt) ?? '';
      groups.set(id, [...(groups.get(id) ?? []), meeting]);
    }
    return groups;
  }, [state, stages]);

  const pending = (state?.meetings ?? []).filter((m) => m.status === 'pending').length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {state ? (
          <DomainsLine projectId={projectId} domains={state.domains} userEmail={userEmail} onSaved={() => void load()} />
        ) : (
          <span className="text-xs text-muted-foreground">{error ?? 'Loading calls…'}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void sync()}
          disabled={syncing || !state?.connected || !state?.domains.length}
          title={
            state && !state.connected
              ? 'Fathom is not connected on this deployment'
              : 'Look through the last six months of Fathom for this client’s calls'
          }
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Check Fathom now
        </Button>
      </div>

      {state && !state.connected && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Fathom isn’t connected yet: add <code>FATHOM_API_KEY</code> to the Vercel environment (Fathom → Settings → API
          Access). Calls are then checked every hour.
        </p>
      )}

      {state && state.meetings.length === 0 && state.connected && (
        <p className="text-sm text-muted-foreground">
          No calls with this client yet. New ones arrive within the hour of Fathom finishing them.
        </p>
      )}

      {pending > 0 && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {pending} call{pending === 1 ? '' : 's'} waiting for someone to read before the client sees {pending === 1 ? 'it' : 'them'}.
        </p>
      )}

      {[...stages, { id: '', title: 'Not filed', startDate: undefined, dueDate: undefined }].map((stage) => {
        const meetings = byStage.get(stage.id) ?? [];
        if (meetings.length === 0) return null;
        return (
          <div key={stage.id || 'none'} className="space-y-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stage.title}</h3>
            <ul className="divide-y divide-border rounded-lg border">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(meeting)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <Video className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{meeting.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {[formatMeetingDay(meeting.startedAt, now), durationOf(meeting)].filter(Boolean).join(' · ')}
                        {!meeting.summary && ' · summary not ready'}
                        {meeting.clientSummary && ' · edited'}
                      </span>
                    </span>
                    <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATUS[meeting.status].className)}>
                      {STATUS[meeting.status].label}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {state?.meetings.some((m) => m.fathomUrl) && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          The client’s “Watch the recording” uses Fathom’s share link, not your workspace link.
        </p>
      )}

      <Dialog open={!!open} onOpenChange={(value) => !value && setOpen(null)}>
        {open && (
          <MeetingReview
            key={open.id}
            meeting={open}
            stages={stages}
            projectId={projectId}
            onClose={() => setOpen(null)}
            onSaved={(saved) =>
              setState((prev) =>
                prev ? { ...prev, meetings: prev.meetings.map((m) => (m.id === saved.id ? saved : m)) } : prev,
              )
            }
          />
        )}
      </Dialog>
    </div>
  );
}
