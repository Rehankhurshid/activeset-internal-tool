'use client';

import { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
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
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * Brings a page list in from a spreadsheet the project started in. All that is
 * left of the old "Client tracker sheet" card: writing a sheet is now the
 * project sheet's job (ProjectSheetPanel), which the app creates and keeps.
 */
export function ImportPagesFromSheet({ projectId }: { projectId: string }) {
  const project = { id: projectId };
  const [busy, setBusy] = useState<'import' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [preview, setPreview] = useState<{ rows: { title: string }[]; duplicates: number } | null>(null);

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
    <>
      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setImportOpen(true)}>
        <Upload className="h-3.5 w-3.5" />
        Import pages from a sheet
      </Button>

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
    </>
  );
}
