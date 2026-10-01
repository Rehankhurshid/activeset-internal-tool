'use client';

import { useState } from 'react';
import { ExternalLink, FileSpreadsheet, Loader2, RefreshCw, Upload, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';
import { TrackerSheetError, deliveryRepository } from '../../infrastructure/delivery.repository';

interface TrackerSheetCardProps {
  project: Pick<Project, 'id' | 'delivery'>;
  /** How many pages would be written, so the button can say something useful. */
  pageCount: number;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The "Project Tracker" tab of the project's Google Sheet.
 *
 * The app owns the page list and writes that one tab from it; the rest of the
 * sheet is the team's. Google gives the app's service account no Drive
 * storage, so the app cannot create a spreadsheet: the first write goes into
 * the project sheet bound on the Client tab, or into a sheet the team picks
 * here and shares with the app as an Editor.
 */
export function TrackerSheetCard({ project, pageCount }: TrackerSheetCardProps) {
  const delivery = project.delivery;
  const [url, setUrl] = useState(delivery?.trackerSheetUrl ?? '');
  const [syncedAt, setSyncedAt] = useState(delivery?.trackerSyncedAt);
  const [busy, setBusy] = useState<'sync' | 'share' | 'import' | null>(null);
  const [configHint, setConfigHint] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [preview, setPreview] = useState<{ rows: { title: string }[]; duplicates: number } | null>(null);

  // Picking the sheet to write into: opened when the app has none, or cannot write to the one it has.
  const [pickOpen, setPickOpen] = useState(false);
  const [pickUrl, setPickUrl] = useState('');
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [serviceEmail, setServiceEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSync = async (sheetUrl?: string) => {
    setBusy('sync');
    setConfigHint(null);
    try {
      const result = await deliveryRepository.syncSheet(project.id, sheetUrl);
      setUrl(result.spreadsheetUrl);
      setSyncedAt(result.syncedAt);
      setPickOpen(false);
      setPickUrl('');
      setPickProblem(null);
      const pagesWord = `${result.rows} ${result.rows === 1 ? 'page' : 'pages'}`;
      toast.success(
        result.created ? `Added a "Project Tracker" tab to ${result.sheetTitle || 'the sheet'}` : `Tracker updated: ${pagesWord}`,
        result.created ? { description: `${pagesWord} written. The other tabs were not touched.` } : undefined,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update the tracker sheet';
      if (err instanceof TrackerSheetError && err.code && ['needs_sheet', 'read_only', 'no_access'].includes(err.code)) {
        // Something the team fixes in Google Sheets: say exactly what, beside where they paste the link.
        setServiceEmail(err.serviceAccountEmail ?? null);
        setPickProblem(err.code === 'needs_sheet' ? null : message);
        setPickOpen(true);
        return;
      }
      // A setup problem has a fix the reader can act on, so keep it on screen
      // rather than in a toast that vanishes.
      if (/enable|not configured|service account/i.test(message)) setConfigHint(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const copyServiceEmail = async () => {
    if (!serviceEmail) return;
    try {
      await navigator.clipboard.writeText(serviceEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy. Select the address instead.');
    }
  };

  const handleShare = async () => {
    const email = shareEmail.trim();
    if (!email) return;
    setBusy('share');
    try {
      await deliveryRepository.shareSheet(project.id, email);
      toast.success(`Shared with ${email}`, { description: 'Google was told not to email them — send the link yourself.' });
      setShareOpen(false);
      setShareEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to share the sheet');
    } finally {
      setBusy(null);
    }
  };

  const handlePreview = async () => {
    if (!importUrl.trim()) return;
    setBusy('import');
    try {
      setPreview(await deliveryRepository.previewSheetImport(project.id, importUrl.trim()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read that sheet');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy('import');
    try {
      const result = await deliveryRepository.importSheet(project.id, importUrl.trim());
      toast.success(
        `Imported ${result.added} new ${result.added === 1 ? 'page' : 'pages'}`,
        { description: `${result.updated} updated, ${result.skipped} unchanged.` },
      );
      setImportOpen(false);
      setImportUrl('');
      setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import that sheet');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {url ? (
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Open tracker sheet
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            No tracker sheet yet. The app writes {pageCount} {pageCount === 1 ? 'page' : 'pages'} into a “Project
            Tracker” tab of the project&apos;s Google Sheet.
          </p>
        )}

        <Button size="sm" className="h-8 text-xs" onClick={() => void handleSync()} disabled={busy !== null}>
          {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {url ? 'Sync now' : 'Write to a sheet'}
        </Button>

        {url && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setShareOpen(true)}
            disabled={busy !== null}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Share
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => setImportOpen(true)}
          disabled={busy !== null}
        >
          <Upload className="h-3.5 w-3.5" />
          Import from a sheet
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        The app owns the page list and writes only the “Project Tracker” tab; the other tabs are never touched.{' '}
        {syncedAt ? `Last synced ${formatWhen(syncedAt)}.` : 'Edits made in that tab are overwritten on the next sync.'}
      </p>

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Which sheet should the tracker go in?</DialogTitle>
            <DialogDescription>
              Google doesn&apos;t let the app create spreadsheets of its own, so it writes a “Project Tracker” tab into a sheet
              your team owns: the project&apos;s sheet, or a new empty one from your Drive.
            </DialogDescription>
          </DialogHeader>

          {pickProblem && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {pickProblem}
            </p>
          )}

          <ol className="list-decimal space-y-2 pl-4 text-xs text-muted-foreground">
            <li>
              <span>Share the sheet as an </span>
              <span className="font-medium text-foreground">Editor</span>
              <span> with</span>
              {serviceEmail ? (
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="select-all break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {serviceEmail}
                  </code>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void copyServiceEmail()}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </span>
              ) : (
                <span> the app&apos;s service account.</span>
              )}
            </li>
            <li>Paste its link below.</li>
          </ol>

          <Input
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={pickUrl}
            onChange={(e) => setPickUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && pickUrl.trim() && void handleSync(pickUrl.trim())}
          />

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPickOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSync(pickUrl.trim() || undefined)} disabled={busy === 'sync'}>
              {busy === 'sync' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pickUrl.trim() ? `Write ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : 'Try again'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {configHint && (
        <p className={cn('rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs', 'text-amber-700 dark:text-amber-300')}>
          {configHint}
        </p>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share the tracker sheet</DialogTitle>
            <DialogDescription>
              Gives read access. Google will not email them, so send the link yourself with the kickoff note.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="email"
            placeholder="name@client.com"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleShare()}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleShare()} disabled={!shareEmail.trim() || busy === 'share'}>
              {busy === 'share' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import pages from an existing sheet</DialogTitle>
            <DialogDescription>
              For a project that started in a spreadsheet. Pages already on the tracker keep what they have; the
              sheet only fills in blanks.
            </DialogDescription>
          </DialogHeader>

          <Input
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={importUrl}
            onChange={(e) => {
              setImportUrl(e.target.value);
              setPreview(null);
            }}
          />

          {preview && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                Found {preview.rows.length} {preview.rows.length === 1 ? 'page' : 'pages'}
                {preview.duplicates > 0 && `, ${preview.duplicates} already on the tracker`}
              </p>
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {preview.rows.slice(0, 6).map((r) => r.title).join(' · ')}
                {preview.rows.length > 6 && ' …'}
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            The sheet must be shared with this app&apos;s service account, or be readable by anyone with the link.
          </p>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            {preview ? (
              <Button size="sm" onClick={() => void handleImport()} disabled={busy === 'import' || preview.rows.length === 0}>
                {busy === 'import' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import {preview.rows.length} {preview.rows.length === 1 ? 'page' : 'pages'}
              </Button>
            ) : (
              <Button size="sm" onClick={() => void handlePreview()} disabled={!importUrl.trim() || busy === 'import'}>
                {busy === 'import' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Check the sheet
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
