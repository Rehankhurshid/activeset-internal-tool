'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClientPlanFile } from '@/types';
import { newPlanId, safeHttpUrl } from '../../domain/client-plan';
import { hostnameOf } from './portal-format';

interface PlanFilesEditorProps {
  files: ClientPlanFile[];
  /** Saves the whole list; the editor waits for it before clearing the form. */
  onChange: (files: ClientPlanFile[]) => Promise<void>;
  /** Label on the add button, e.g. "Add a file to Design". */
  addLabel?: string;
  disabled?: boolean;
}

/**
 * Files on the client's dashboard: a link and a name, nothing else. Saves as
 * soon as one is added or removed, because pasting a Figma link should be one
 * step, not an edit mode.
 */
export function PlanFilesEditor({ files, onChange, addLabel = 'Add a file', disabled = false }: PlanFilesEditorProps) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const safe = safeHttpUrl(url);

  const save = async (next: ClientPlanFile[]) => {
    setBusy(true);
    try {
      await onChange(next);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the files');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!safe) return;
    const ok = await save([...files, { id: newPlanId('file'), title: title.trim() || hostnameOf(safe), url: safe }]);
    if (ok) {
      setTitle('');
      setUrl('');
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="group inline-flex max-w-full items-center gap-1 rounded-md border bg-background py-0.5 pl-2 pr-0.5 text-xs"
            >
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 hover:underline"
                title={file.url}
              >
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{file.title}</span>
              </a>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                onClick={() => void save(files.filter((f) => f.id !== file.id))}
                disabled={busy || disabled}
                aria-label={`Remove ${file.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="flex flex-col gap-1.5 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link (Figma, Drive, staging…)"
            aria-label="File link"
            className="h-8 text-xs sm:flex-[3]"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={safe ? hostnameOf(safe) : 'Name (optional)'}
            aria-label="File name"
            className="h-8 text-xs sm:flex-[2]"
          />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={!safe || busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setAdding(false);
                setUrl('');
                setTitle('');
              }}
            >
              Cancel
            </Button>
          </div>
          {url.trim() && !safe && (
            <p className="text-[11px] text-destructive sm:basis-full">That doesn&apos;t look like a web link.</p>
          )}
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setAdding(true)}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
