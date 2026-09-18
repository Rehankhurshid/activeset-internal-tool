'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Radar } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ProjectLink } from '@/types';
import { normalizePagePath } from '../../infrastructure/delivery.repository';

export interface ImportPagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project's links; only the auto-discovered ones are offered. */
  links: ProjectLink[];
  /** Normalized paths already on the tracker, so nothing is offered twice. */
  trackedPaths: Set<string>;
  onImport: (links: ProjectLink[]) => Promise<{ added: number; skipped: number }>;
}

/**
 * Seeds the tracker from pages the app already discovered.
 *
 * This is the point of the whole feature: the sitemap scan and the Webflow sync
 * already know every URL on the site, and retyping them into a spreadsheet is
 * the duplication being removed. Links already on the tracker are shown but not
 * selectable — running this twice after a rescan should be safe and obvious.
 */
export function ImportPagesDialog({
  open,
  onOpenChange,
  links,
  trackedPaths,
  onImport,
}: ImportPagesDialogProps) {
  const discovered = useMemo(
    () =>
      links
        .filter((link) => link.source === 'auto' && link.url)
        .map((link) => ({ link, path: normalizePagePath(link.url) })),
    [links],
  );
  const available = useMemo(
    () => discovered.filter((item) => !trackedPaths.has(item.path)),
    [discovered, trackedPaths],
  );
  const alreadyTracked = discovered.length - available.length;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [importing, setImporting] = useState(false);

  // Preselect everything new each time the dialog opens — the common case is
  // "add all of them". Keyed on the ids rather than the array so a background
  // snapshot (someone else moving a status) cannot wipe out a hand-made
  // selection while the dialog is open.
  const availableKey = available.map((item) => item.link.id).join('|');
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(availableKey ? availableKey.split('|') : []));
  }, [open, availableKey]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = available.length > 0 && selected.size === available.length;

  const runImport = async () => {
    const chosen = available.filter((item) => selected.has(item.link.id)).map((item) => item.link);
    if (chosen.length === 0) return;
    setImporting(true);
    try {
      const result = await onImport(chosen);
      toast.success(
        `Added ${result.added} ${result.added === 1 ? 'page' : 'pages'}` +
          (result.skipped > 0 ? `, skipped ${result.skipped} already on the tracker` : ''),
      );
      onOpenChange(false);
    } catch (error) {
      console.error('[ImportPagesDialog] import failed', error);
      toast.error(error instanceof Error ? error.message : 'Could not import the pages');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from sitemap</DialogTitle>
          <DialogDescription>
            Pages this project has already discovered. Picking them here puts them on the tracker —
            discovering a URL is not the same as agreeing to build it.
          </DialogDescription>
        </DialogHeader>

        {discovered.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <Radar className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No discovered pages yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run a sitemap scan from the Audit tab first — the pages it finds show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {selected.size} of {available.length} selected
                {alreadyTracked > 0 && ` · ${alreadyTracked} already on the tracker`}
              </span>
              {available.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setSelected(
                      allSelected ? new Set() : new Set(available.map((item) => item.link.id)),
                    )
                  }
                >
                  {allSelected ? 'Select none' : 'Select all'}
                </Button>
              )}
            </div>

            <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {discovered.map(({ link, path }) => {
                const tracked = trackedPaths.has(path);
                const checked = selected.has(link.id);
                return (
                  <label
                    key={link.id}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1.5',
                      tracked ? 'opacity-50' : 'cursor-pointer hover:bg-accent',
                    )}
                  >
                    <Checkbox
                      checked={tracked ? false : checked}
                      disabled={tracked || importing}
                      onCheckedChange={() => toggle(link.id)}
                      aria-label={`Import ${path}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {link.title?.trim() || path}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {path}
                      </span>
                    </span>
                    {tracked && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">On tracker</span>
                    )}
                  </label>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            {discovered.length === 0 ? 'Close' : 'Cancel'}
          </Button>
          {discovered.length > 0 && (
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={importing || selected.size === 0}
              onClick={() => void runImport()}
            >
              {importing && <Loader2 className="size-3.5 animate-spin" />}
              Add {selected.size} {selected.size === 1 ? 'page' : 'pages'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
