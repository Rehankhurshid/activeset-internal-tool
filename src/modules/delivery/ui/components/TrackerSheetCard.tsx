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
import { deliveryRepository } from '../../infrastructure/delivery.repository';

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
 * The client's Google Sheet.
 *
 * The app owns the page data and this writes it out; nobody edits the sheet.
 * That is the only arrangement that survives an automatically discovered page
 * list, and it is why there is a Sync button rather than a two-way toggle.
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

  const handleSync = async () => {
    setBusy('sync');
    setConfigHint(null);
    try {
      const result = await deliveryRepository.syncSheet(project.id);
      setUrl(result.spreadsheetUrl);
      setSyncedAt(result.syncedAt);
      toast.success(
        result.created
          ? 'Tracker sheet created'
          : `Tracker sheet updated — ${result.rows} ${result.rows === 1 ? 'page' : 'pages'}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update the tracker sheet';
      // A setup problem has a fix the reader can act on, so keep it on screen
      // rather than in a toast that vanishes.
      if (/enable|not configured|service account/i.test(message)) setConfigHint(message);
      toast.error(message);
    } finally {
      setBusy(null);
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
            No tracker sheet yet. Generating one writes {pageCount} {pageCount === 1 ? 'page' : 'pages'} into a
            Google Sheet you can share with the client.
          </p>
        )}

        <Button size="sm" className="h-8 text-xs" onClick={() => void handleSync()} disabled={busy !== null}>
          {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {url ? 'Sync now' : 'Generate sheet'}
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
        The app owns the page list; the sheet is written from it.{' '}
        {syncedAt ? `Last synced ${formatWhen(syncedAt)}.` : 'Edits made in the sheet are overwritten on the next sync.'}
      </p>

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
