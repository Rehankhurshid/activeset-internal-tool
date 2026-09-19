'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
import { normalizePagePath, titleFromPath } from '../../infrastructure/delivery.repository';

export interface AddPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rejecting keeps the dialog open and shows the reason. */
  onAdd: (input: { path: string; title: string }) => Promise<void>;
}

/**
 * One page, typed by hand.
 *
 * The title fills itself in from the path and stops doing so the moment anyone
 * types over it — most pages are called what their slug says, and the ones that
 * are not are exactly the ones someone will rename anyway.
 */
export function AddPageDialog({ open, onOpenChange, onAdd }: AddPageDialogProps) {
  const [path, setPath] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setPath('');
    setTitle('');
    setTitleTouched(false);
    setError(null);
  }, [open]);

  const handlePathChange = (next: string) => {
    setPath(next);
    setError(null);
    if (!titleTouched) setTitle(next.trim() ? titleFromPath(next) : '');
  };

  const submit = async () => {
    const trimmed = path.trim();
    if (!trimmed) {
      setError('A path is required, e.g. /pricing');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd({ path: trimmed, title: title.trim() });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the page');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a page</DialogTitle>
          <DialogDescription>
            Paste a URL or type a path. Everything after the domain is what gets stored.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-col gap-3 overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="min-h-0 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="delivery-add-path" className="text-xs">
                Path
              </Label>
              <Input
                id="delivery-add-path"
                value={path}
                onChange={(event) => handlePathChange(event.target.value)}
                placeholder="/pricing"
                autoFocus
                className="h-8 font-mono text-xs"
              />
              {path.trim() && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  Stored as {normalizePagePath(path)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delivery-add-title" className="text-xs">
                Title
              </Label>
              <Input
                id="delivery-add-title"
                value={title}
                onChange={(event) => {
                  setTitleTouched(true);
                  setTitle(event.target.value);
                }}
                placeholder="Pricing"
                className="h-8 text-xs"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving || !path.trim()}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              Add page
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
