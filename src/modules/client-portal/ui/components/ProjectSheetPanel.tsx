'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clientPortalRepository, type ProjectSheetState } from '../../infrastructure/client-portal.repository';
import { ProjectSheetCard, useProjectSheet } from './ProjectSheetCard';

type SheetHook = ReturnType<typeof useProjectSheet>;

interface ProjectSheetPanelProps {
  projectId: string;
  /** Pass the Client tab's hook to share its state; otherwise the panel loads its own. */
  sheetState?: SheetHook;
  /** For the hand-kept sheet's switches ("Stages come from"), when the Timeline also has stages. */
  hasAppTimeline?: boolean;
  /** One line on the Delivery tab rather than the Client tab's card body. */
  compact?: boolean;
}

function agoLabel(iso: string | undefined): string {
  if (!iso) return 'not yet';
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (Number.isNaN(minutes)) return 'not yet';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The project sheet: the app creates it in the team's Shared Drive and keeps it
 * up to date from the checklist, the pages and the requests (Rehan,
 * 2026-10-01: "the starting point for the sheet", "in sync continuously with
 * any update in Checklist"). One per project, shaped by what it bought. A
 * project still on a hand-kept sheet (Different AI) keeps that card, with the
 * way to move over.
 */
export function ProjectSheetPanel({ projectId, sheetState, hasAppTimeline = false, compact = false }: ProjectSheetPanelProps) {
  const own = useProjectSheet(projectId, !sheetState);
  const hook = sheetState ?? own;
  const { state, setState, error } = hook;
  const [busy, setBusy] = useState<'create' | 'write' | 'drive' | null>(null);
  const [driveUrl, setDriveUrl] = useState('');
  const [copied, setCopied] = useState(false);
  // Re-render once a minute so "updated 3 min ago" stays true while the tab is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const run = async (kind: 'create' | 'write' | 'drive', action: () => Promise<ProjectSheetState>, done: string) => {
    setBusy(kind);
    try {
      setState(await action());
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };
  const create = () => run('create', () => clientPortalRepository.createSheet(projectId), 'Project sheet created');
  const writeNow = () => run('write', () => clientPortalRepository.syncSheet(projectId), 'Sheet updated');
  const saveDrive = () => run('drive', () => clientPortalRepository.setSheetDrive(projectId, driveUrl), 'Shared Drive connected');

  if (error && !state) return <p className="text-xs text-destructive">{error}</p>;
  if (!state) return <p className="text-xs text-muted-foreground">Loading the project sheet…</p>;

  const sheet = state.sheet;
  const drive = state.drive ?? null;

  // A sheet the app keeps.
  if (sheet?.managed) {
    return (
      <div className={compact ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : 'space-y-2'}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <a href={sheet.url} target="_blank" rel="noopener noreferrer">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {sheet.title || 'Project sheet'}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => void writeNow()} disabled={busy !== null}>
            {busy === 'write' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Update now
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Updated {agoLabel(sheet.writtenAt)}. The app keeps it in step with the checklist, the pages and the requests for the
          client, within moments of a change; edits made in the sheet are replaced.
        </p>
        {sheet.writeError && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
            The last update failed: {sheet.writeError.message}
          </p>
        )}
      </div>
    );
  }

  // Not set up yet: where the app may create sheets.
  if (!drive) {
    const email = state.serviceAccountEmail;
    const copy = async () => {
      if (!email) return;
      try {
        await navigator.clipboard.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        toast.error('Could not copy. Select the address instead.');
      }
    };
    return (
      <div className="space-y-3">
        {sheet && !compact && <ProjectSheetCard projectId={projectId} sheetState={hook} hasAppTimeline={hasAppTimeline} />}
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">One-time setup: where the app creates project sheets</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>In Google Drive, create a Shared Drive, e.g. “Client Project Sheets”.</li>
            <li>
              Add the app as a <span className="font-medium text-foreground">Content manager</span>:
              {email ? (
                <span className="ml-1 inline-flex items-center gap-1">
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">{email}</code>
                  <button type="button" onClick={() => void copy()} className="text-muted-foreground hover:text-foreground" aria-label="Copy the address">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </span>
              ) : (
                ' (this deployment has no service account configured)'
              )}
            </li>
            <li>Paste the Shared Drive’s link here. Every project’s sheet goes in it from then on.</li>
          </ol>
          <div className="flex gap-2">
            <Input
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && driveUrl.trim() && void saveDrive()}
              placeholder="https://drive.google.com/drive/folders/…"
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 text-xs" onClick={() => void saveDrive()} disabled={!driveUrl.trim() || busy !== null}>
              {busy === 'drive' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Connect
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Ready: create it (or move a hand-kept sheet over).
  return (
    <div className="space-y-3">
      {sheet && !compact && <ProjectSheetCard projectId={projectId} sheetState={hook} hasAppTimeline={hasAppTimeline} />}
      <div className={compact ? 'flex flex-wrap items-center gap-3' : 'flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3'}>
        <Button size="sm" className="h-8 text-xs" onClick={() => void create()} disabled={busy !== null}>
          {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          {sheet ? 'Replace with a sheet the app keeps' : 'Create the project sheet'}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {sheet
            ? `This project's sheet is kept by hand. The app can make a new one in ${drive.name} and keep it from the checklist; the old sheet is left as it is.`
            : `The app creates it in ${drive.name}, with only the stages this project has, and keeps it up to date from the checklist, the pages and the requests for the client.`}
        </p>
      </div>
    </div>
  );
}
