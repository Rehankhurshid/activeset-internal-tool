'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MASTER_TEMPLATE_COPY_URL } from '../../domain/project-sheet.template';
import type { ProjectSheetData, SheetStagesFrom, SheetTabReport, SheetTabRole } from '../../domain/project-sheet.types';
import {
  clientPortalRepository,
  type ProjectSheetSettings,
  type ProjectSheetState,
} from '../../infrastructure/client-portal.repository';
import { copyText } from './copy-text';

/** What each role is called in the Client tab. */
const ROLE_LABEL: Record<SheetTabRole, string> = {
  overview: 'Overview',
  timeline: 'Timeline',
  tracker: 'Tracker',
  inputs: 'Client inputs',
  changes: 'Change log',
  launch: 'Launch checklist',
  seo: 'SEO tags',
  redirects: 'Redirects',
  fill: '[Fill this] ask',
  ignored: 'Not read',
};

const ROLE_ORDER: SheetTabRole[] = ['overview', 'timeline', 'tracker', 'inputs', 'changes', 'launch', 'seo', 'redirects', 'fill', 'ignored'];

const AUTO = '__auto__';

/** "just now", "6 min ago", "3 h ago", "2 days ago". */
function agoLabel(iso: string | undefined, now: number): string {
  if (!iso) return 'never';
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The project sheet's state for the Client tab, loaded once and replaced by every action's answer. */
export function useProjectSheet(projectId: string, enabled = true) {
  const [state, setState] = useState<ProjectSheetState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await clientPortalRepository.getSheet(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the project sheet');
    }
  }, [projectId]);

  useEffect(() => {
    // Off when a parent already holds this state and passes it down.
    if (enabled) void reload();
  }, [reload, enabled]);

  return { state, setState, error, reload };
}

/** One line per portal section: what the client sees from this sheet right now. */
function whatTheClientSees(data: ProjectSheetData | undefined): { label: string; value: string }[] {
  if (!data) return [];
  const rows: { label: string; value: string }[] = [];
  const phases = data.timeline?.phases ?? [];
  if (phases.length) {
    const milestones = phases.reduce((n, p) => n + p.milestones.length, 0);
    rows.push({ label: 'Stages', value: `${phases.length} phases, ${milestones} milestones` });
  }
  if (data.workstreams.length) {
    rows.push({
      label: 'Work',
      value: data.workstreams.map((w) => `${w.title} (${w.items.length})`).join(', '),
    });
  }
  const pending = data.inputs.filter((i) => i.state === 'pending').length;
  const received = data.inputs.filter((i) => i.state === 'received').length;
  if (data.inputs.length || data.fills.length) {
    rows.push({
      label: 'Asks',
      value: [`${pending} open`, received ? `${received} received` : '', data.fills.length ? `${data.fills.length} [Fill this] tab${data.fills.length === 1 ? '' : 's'}` : '']
        .filter(Boolean)
        .join(', '),
    });
  }
  if (data.changes.length) rows.push({ label: 'Changes', value: `${data.changes.length} change request${data.changes.length === 1 ? '' : 's'}` });
  const checks = (data.launch?.groups ?? []).flatMap((g) => g.checks);
  const ready = [
    checks.length ? `launch ${checks.filter((c) => c.done).length}/${checks.length}` : '',
    ...data.seo.map((s) => `SEO${s.language ? ` ${s.language}` : ''} ${s.filled}/${s.pages}`),
    data.redirects ? `redirects ${data.redirects.mapped}/${data.redirects.total}` : '',
  ].filter(Boolean);
  if (ready.length) rows.push({ label: 'Launch', value: ready.join(', ') });
  if (data.overview?.links.length) rows.push({ label: 'Links', value: data.overview.links.map((l) => l.title).join(', ') });
  return rows;
}

function TabRow({
  tab,
  busy,
  onRole,
}: {
  tab: SheetTabReport;
  busy: boolean;
  onRole: (role: SheetTabRole | null) => void;
}) {
  const read = tab.role !== 'ignored';
  return (
    <li className="grid gap-1.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_13.5rem] sm:items-start sm:gap-3">
      <div className="min-w-0 space-y-0.5">
        <p className={cn('truncate text-sm', read ? 'font-medium text-foreground' : 'text-muted-foreground')}>{tab.title}</p>
        {read && (
          <p className="text-[11px] text-muted-foreground">
            {tab.rows} {tab.rows === 1 ? 'row' : 'rows'}
            {tab.headerRow ? ` · header on row ${tab.headerRow}` : ''}
            {tab.columns.length ? ` · ${tab.columns.slice(0, 6).join(', ')}${tab.columns.length > 6 ? '…' : ''}` : ''}
          </p>
        )}
        {tab.sample && (
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={tab.sample}>
            First row: {tab.sample}
          </p>
        )}
        {tab.warnings.map((warning) => (
          <p key={warning} className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            {warning}
          </p>
        ))}
      </div>
      <Select
        value={tab.how === 'team' ? tab.role : AUTO}
        onValueChange={(value) => onRole(value === AUTO ? null : (value as SheetTabRole))}
        disabled={busy}
      >
        <SelectTrigger size="sm" className="w-full text-xs" aria-label={`What ${tab.title} is`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO} className="text-xs">
            {tab.how === 'team' ? 'By its name' : `${ROLE_LABEL[tab.role]} (by its name)`}
          </SelectItem>
          {ROLE_ORDER.map((role) => (
            <SelectItem key={role} value={role} className="text-xs">
              {role === 'ignored' ? 'Don’t read this tab' : `Use as ${ROLE_LABEL[role]}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );
}

interface ProjectSheetCardProps {
  projectId: string;
  sheetState: ReturnType<typeof useProjectSheet>;
  /** Whether the app's own Timeline tab has stages too, which is when the team chooses between them. */
  hasAppTimeline: boolean;
}

/**
 * The project's Google Sheet, as the portal reads it. Paste a link, see which
 * tabs the app understood and which it leaves alone, correct any of them, and
 * choose what the client gets. Nothing here writes to the sheet.
 */
export function ProjectSheetCard({ projectId, sheetState, hasAppTimeline }: ProjectSheetCardProps) {
  const { state, setState, error } = sheetState;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const [copied, setCopied] = useState(false);
  const now = useMemo(() => Date.now(), [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, action: () => Promise<ProjectSheetState>, done?: string) => {
    setBusy(key);
    try {
      const next = await action();
      setState(next);
      if (done) toast.success(done);
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      // The route records a failed sync on the record; show it.
      void sheetState.reload();
      return null;
    } finally {
      setBusy(null);
    }
  };

  const copyEmail = async (email: string) => {
    const ok = await copyText(email);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy. Select the address instead.');
    }
  };

  if (!state) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {error ? error : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</>}
      </p>
    );
  }

  const { sheet, serviceAccountEmail } = state;
  const shareLine = serviceAccountEmail ? (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs">
      <span className="text-muted-foreground">Share the sheet as a Viewer (an Editor if the Delivery tab should write its tracker tab into it) with</span>
      <code className="select-all break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{serviceAccountEmail}</code>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copyEmail(serviceAccountEmail)}>
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  ) : (
    <p className="text-xs text-amber-700 dark:text-amber-300">
      This deployment has no service account key, so it cannot read Google Sheets. Set FIREBASE_SERVICE_ACCOUNT_JSON.
    </p>
  );

  if (!sheet) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          void run('bind', () => clientPortalRepository.bindSheet(projectId, url.trim()), 'Sheet bound and read').then((next) => {
            if (next) setUrl('');
          });
        }}
      >
        <p className="text-sm text-muted-foreground">
          Bind the project&apos;s Google Sheet and the client&apos;s page reads it: stages from its Timeline tab, progress from its
          trackers, asks from Client Inputs and any <span className="font-mono text-xs">[Fill this]</span> tab, changes from its
          Change Log. The team keeps working in the sheet; tabs the app doesn&apos;t know are left alone.
        </p>
        <p className="text-sm">
          New project?{' '}
          <a href={MASTER_TEMPLATE_COPY_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
            Make a copy of the master template
          </a>
          <span className="text-muted-foreground">
            : Overview, Process, Pages and What we need. Delete the stages the project doesn&apos;t include.
          </span>
        </p>
        {shareLine}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Label htmlFor={`sheet-url-${projectId}`} className="sr-only">
            Google Sheet link
          </Label>
          <Input
            id={`sheet-url-${projectId}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="text-sm sm:flex-1"
          />
          <Button type="submit" size="sm" disabled={!url.trim() || busy !== null}>
            {busy === 'bind' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Bind sheet
          </Button>
        </div>
      </form>
    );
  }

  const summary = whatTheClientSees(sheet.data);
  const tabs = sheet.report?.tabs ?? [];
  const read = tabs.filter((t) => t.role !== 'ignored');
  const ignored = tabs.filter((t) => t.role === 'ignored');
  const setting = (key: string, settings: ProjectSheetSettings, done?: string) =>
    run(key, () => clientPortalRepository.updateSheetSettings(projectId, settings), done);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <a
            href={sheet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium hover:underline"
          >
            <span className="truncate">{sheet.title || 'Project sheet'}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
          <p className="text-[11px] text-muted-foreground">
            Read {agoLabel(sheet.syncedAt, now)}
            {sheet.changedAt && sheet.changedAt !== sheet.syncedAt ? ` · last changed ${agoLabel(sheet.changedAt, now)}` : ''} ·
            re-read every 15 minutes
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => run('sync', () => clientPortalRepository.syncSheet(projectId), 'Read the sheet again')}
          >
            {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync now
          </Button>
          {confirmUnbind ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run('unbind', () => clientPortalRepository.unbindSheet(projectId), 'Sheet unbound').then(() => setConfirmUnbind(false))
                }
              >
                Unbind
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmUnbind(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmUnbind(true)} title="Stop reading this sheet">
              <Unlink className="h-3.5 w-3.5" />
              <span className="sr-only">Unbind</span>
            </Button>
          )}
        </div>
      </div>

      {sheet.syncError && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              The last read failed {agoLabel(sheet.syncError.at, now)}: {sheet.syncError.message}
              {sheet.data ? ' The client still sees the read before it.' : ''}
            </span>
          </p>
          {/can't open this sheet/.test(sheet.syncError.message) && shareLine}
        </div>
      )}

      {confirmUnbind && (
        <p className="text-xs text-muted-foreground">
          Unbinding forgets the sheet and its last read. The client&apos;s page goes back to the app&apos;s Timeline or plan.
        </p>
      )}

      {summary.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What the client sees from it</h3>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
            {summary.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 text-xs text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
          <div className="space-y-0.5">
            <Label htmlFor={`sheet-link-${projectId}`} className="text-xs font-medium">
              Link the client to the sheet
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Adds “Project sheet” to their files and to each <span className="font-mono">[Fill this]</span> ask. Give them edit access in
              Sheets and protect every other range.
            </p>
          </div>
          <Switch
            id={`sheet-link-${projectId}`}
            checked={sheet.showSheetLink === true}
            disabled={busy !== null}
            onCheckedChange={(checked) => setting('link', { showSheetLink: checked }, checked ? 'The client sees the sheet link' : 'Sheet link removed')}
          />
        </div>
        {hasAppTimeline && (sheet.data?.timeline?.phases.length ?? 0) > 0 && (
          <div className="space-y-1.5 rounded-md border border-border px-3 py-2.5">
            <Label htmlFor={`sheet-stages-${projectId}`} className="text-xs font-medium">
              Stages come from
            </Label>
            <Select
              value={sheet.stagesFrom ?? 'sheet'}
              onValueChange={(value) => setting('stages', { stagesFrom: value as SheetStagesFrom }, 'Saved')}
              disabled={busy !== null}
            >
              <SelectTrigger id={`sheet-stages-${projectId}`} size="sm" className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sheet" className="text-xs">
                  The sheet&apos;s Timeline tab
                </SelectItem>
                <SelectItem value="app" className="text-xs">
                  The app&apos;s Timeline tab
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {(sheet.report?.unknownStatuses.length ?? 0) > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Read as In progress because the words aren&apos;t in the status legend: {sheet.report!.unknownStatuses.map((w) => `“${w}”`).join(', ')}.
          </span>
        </p>
      )}

      <div className="space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tabs read <span className="tabular-nums">({read.length})</span>
        </h3>
        <ul className="divide-y divide-border/60">
          {read.map((tab) => (
            <TabRow
              key={tab.title}
              tab={tab}
              busy={busy !== null}
              onRole={(role) => setting(`tab:${tab.title}`, { tab: { title: tab.title, role } }, 'Saved and read again')}
            />
          ))}
        </ul>
      </div>

      {ignored.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Not read <span className="tabular-nums">({ignored.length})</span>
            <span className="ml-1 font-normal normal-case tracking-normal">: tabs the app doesn&apos;t recognise never reach the client</span>
          </summary>
          <ul className="mt-1 divide-y divide-border/60">
            {ignored.map((tab) => (
              <TabRow
                key={tab.title}
                tab={tab}
                busy={busy !== null}
                onRole={(role) => setting(`tab:${tab.title}`, { tab: { title: tab.title, role } }, 'Saved and read again')}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
