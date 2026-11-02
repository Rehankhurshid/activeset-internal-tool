'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Project, ProjectChecklist, SignOffChannel } from '@/types';
import { projectsService } from '@/services/database';
import {
  SIGN_OFF_CHANNELS,
  SIGN_OFF_CHANNEL_LABELS,
  phaseAfterSignOffs,
  recordedByTeam,
  signOffLog,
  teamSignOff,
  withSignOff,
  withoutSignOff,
} from '../../domain/sign-off-log';
import { isoToday } from '../../domain/waiting-on-client';

interface SignOffLogCardProps {
  project: Project;
  checklists: ProjectChecklist[];
  /** The stages the client's page shows, for "what comes next". */
  stages: { title: string; state: 'done' | 'current' | 'upcoming' }[];
  currentIndex?: number;
  userEmail: string;
}

const NONE = '__none__';

function longDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function RecordForm({
  project,
  reviewStages,
  userEmail,
  onDone,
}: {
  project: Project;
  reviewStages: { key: string; title: string }[];
  userEmail: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(isoToday(new Date()));
  const [via, setVia] = useState<SignOffChannel>('slack');
  const [sourceUrl, setSourceUrl] = useState('');
  const [note, setNote] = useState('');
  const [stageKey, setStageKey] = useState(NONE);
  const [saving, setSaving] = useState(false);

  async function submit() {
    let entry;
    try {
      entry = teamSignOff(
        {
          title: title || reviewStages.find((s) => s.key === stageKey)?.title || '',
          date,
          via,
          sourceUrl,
          note,
          stageKey: stageKey === NONE ? undefined : stageKey,
          recordedBy: userEmail,
        },
        () => crypto.randomUUID(),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Check the fields');
      return;
    }
    setSaving(true);
    try {
      await projectsService.updateSignOffs(project.id, (current) => withSignOff(current, entry), userEmail);
      toast.success('Sign-off recorded');
      onDone();
    } catch {
      toast.error('Could not record the sign-off');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="signoff-title" className="text-xs">What they signed off</Label>
          <Input
            id="signoff-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Homepage design"
            maxLength={200}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="signoff-date" className="text-xs">On</Label>
          <Input id="signoff-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Where</Label>
          <Select value={via} onValueChange={(v) => setVia(v as SignOffChannel)}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGN_OFF_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {SIGN_OFF_CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="signoff-link" className="text-xs">Link to the message (team only)</Label>
          <Input
            id="signoff-link"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…slack.com/archives/…"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="signoff-note" className="text-xs">What they said (the client sees this)</Label>
        <Textarea
          id="signoff-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Picked the green variant"
          maxLength={2000}
          rows={2}
          className="text-sm"
        />
      </div>
      {reviewStages.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Answers the review their page is asking for</Label>
          <Select value={stageKey} onValueChange={setStageKey}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No, something else</SelectItem>
              {reviewStages.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Record sign-off'}
        </Button>
      </div>
    </div>
  );
}

/**
 * The sign-off log (ACT-91): everything the client approved, when, and what
 * they said, oldest first, then which phase comes next. Approvals from the
 * portal's button and ones the team records from Slack, email or a call sit
 * in the same `delivery.approvals` list. Recording one against a review stage
 * stops their page asking for it. The source link and who recorded it stay on
 * this side; the client sees what, when, where and their words.
 */
export function SignOffLogCard({ project, checklists, stages, currentIndex, userEmail }: SignOffLogCardProps) {
  const [adding, setAdding] = useState(false);
  const log = useMemo(() => signOffLog(project.delivery?.approvals), [project.delivery?.approvals]);
  const answered = new Set(log.map((a) => a.stageKey));
  const reviewStages = checklists.flatMap((c) =>
    (c.sections ?? [])
      .filter((s) => s.role === 'client_review')
      .map((s) => ({ key: `${c.id}:${s.id}`, title: s.title }))
      .filter((s) => !answered.has(s.key)),
  );
  const after = phaseAfterSignOffs(stages, currentIndex);

  async function remove(stageKey: string, title: string) {
    if (!window.confirm(`Remove the sign-off for “${title}” from the log? The client stops seeing it.`)) return;
    try {
      await projectsService.updateSignOffs(project.id, (current) => withoutSignOff(current, stageKey), userEmail);
    } catch {
      toast.error('Could not remove it');
    }
  }

  return (
    <div className="space-y-3">
      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing signed off yet. Approvals from the client&apos;s page land here; record one they gave in Slack, by email or on a
          call so it is not only in a thread.
        </p>
      ) : (
        <ol className="divide-y divide-border/60">
          {log.map((a) => (
            <li key={a.stageKey} className="flex items-start gap-2 py-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{a.stageTitle}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{longDay(a.approvedAt)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {recordedByTeam(a)
                    ? `${a.via ? SIGN_OFF_CHANNEL_LABELS[a.via] : 'Outside the portal'}${a.recordedBy ? ` · recorded by ${a.recordedBy.split('@')[0]}` : ''}`
                    : 'Approved on their page'}
                  {a.sourceUrl && (
                    <>
                      {' · '}
                      <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </p>
                {a.note && <p className="text-xs italic text-foreground">&ldquo;{a.note}&rdquo;</p>}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-600"
                onClick={() => remove(a.stageKey, a.stageTitle)}
                title="Remove from the log"
                aria-label={`Remove the sign-off for ${a.stageTitle}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      )}

      {(after.now || after.next || after.done) && (
        <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
          {after.done
            ? 'Every stage is done.'
            : [after.now ? `Now: ${after.now}` : '', after.next ? `Next: ${after.next}` : ''].filter(Boolean).join(' · ')}
        </p>
      )}

      {adding ? (
        <RecordForm project={project} reviewStages={reviewStages} userEmail={userEmail} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Record a sign-off
        </Button>
      )}
    </div>
  );
}
