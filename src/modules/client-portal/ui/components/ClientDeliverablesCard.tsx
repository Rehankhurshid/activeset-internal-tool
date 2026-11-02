'use client';

import { useMemo, useState } from 'react';
import { EyeOff, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project, ProjectLink } from '@/types';
import { nextDeliverableVersion, portalDeliverables } from '../../domain/portal-deliverables';
import { clientPortalRepository, type DeliverableInput } from '../../infrastructure/client-portal.repository';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type Editing =
  | { mode: 'add'; draft: DeliverableInput }
  | { mode: 'version'; draft: DeliverableInput }
  | { mode: 'edit'; linkId: string; draft: DeliverableInput };

const EMPTY: DeliverableInput = { title: '', url: '', sharedAt: '', sharedWith: '', version: 1 };

function draftOf(link: ProjectLink): DeliverableInput {
  return {
    title: link.title,
    url: link.url,
    sharedAt: link.sharedAt ?? '',
    sharedWith: link.sharedWith ?? '',
    version: link.version,
    deliverableId: link.deliverableId,
  };
}

/**
 * The Client tab's "Deliverables": what we handed over outside the build (a
 * data sheet, a report), each version with the day it was shared and who got
 * it. Each entry is a manual link on the project marked for the client, so it
 * also sits on the Links tab; "Take off the page" leaves it there.
 */
export function ClientDeliverablesCard({ project }: { project: Pick<Project, 'id' | 'links'> }) {
  const links = useMemo(() => project.links ?? [], [project.links]);
  const deliverables = useMemo(() => portalDeliverables(links), [links]);
  const byId = useMemo(() => new Map(links.map((l) => [l.id, l])), [links]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const startAdd = () => setEditing({ mode: 'add', draft: { ...EMPTY, sharedAt: todayIso() } });
  const startVersion = (groupId: string) => {
    const latest = byId.get(deliverables.find((d) => d.id === groupId)?.versions[0]?.id ?? '');
    setEditing({
      mode: 'version',
      draft: {
        title: latest?.title ?? '',
        url: '',
        sharedAt: todayIso(),
        sharedWith: latest?.sharedWith ?? '',
        version: nextDeliverableVersion(links, groupId),
        deliverableId: groupId,
      },
    });
  };
  const startEdit = (linkId: string) => {
    const link = byId.get(linkId);
    if (link) setEditing({ mode: 'edit', linkId, draft: draftOf(link) });
  };

  const setDraft = (patch: Partial<DeliverableInput>) =>
    setEditing((e) => (e ? ({ ...e, draft: { ...e.draft, ...patch } } as Editing) : e));

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || saving) return;
    const { draft } = editing;
    if (!draft.title.trim() || !draft.url.trim()) return;
    setSaving(true);
    try {
      if (editing.mode === 'edit') await clientPortalRepository.updateDeliverable(project.id, editing.linkId, draft);
      else await clientPortalRepository.addDeliverable(project.id, draft, links.length);
      toast.success(editing.mode === 'version' ? `Version ${draft.version ?? ''} added`.trim() : 'Deliverable saved');
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the deliverable');
    } finally {
      setSaving(false);
    }
  };

  const handleHide = async (linkId: string) => {
    setBusyId(linkId);
    try {
      await clientPortalRepository.setDeliverableVisible(project.id, linkId, false);
      toast.success('Taken off the client’s page. The link stays on the Links tab.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update the deliverable');
    } finally {
      setBusyId(null);
    }
  };

  const draft = editing?.draft;
  const title = editing?.mode === 'edit' ? 'Edit deliverable' : editing?.mode === 'version' ? 'New version' : 'Add a deliverable';

  return (
    <div className="space-y-3">
      {deliverables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing handed over yet. Add a file or sheet you shared with the client, and it appears on their page with its
          version, the day and who got it.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {deliverables.map((deliverable) => (
            <li key={deliverable.id} className="space-y-1 py-2">
              {deliverable.versions.map((version, index) => (
                <div
                  key={version.id}
                  className={index === 0 ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : 'flex flex-wrap items-center gap-x-2 gap-y-1 pl-4 text-muted-foreground'}
                >
                  <a
                    href={version.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={index === 0 ? 'text-sm font-medium hover:underline' : 'text-xs hover:underline'}
                  >
                    {version.title}
                  </a>
                  {version.version && (
                    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                      v{version.version}
                      {index === 0 && deliverable.versions.length > 1 ? ' · latest' : ''}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {[version.sharedAt ? formatDay(version.sharedAt) : '', version.sharedWith ? `to ${version.sharedWith}` : '']
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                  <span className="ml-auto flex items-center gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Edit ${version.title}`}
                      onClick={() => startEdit(version.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Take ${version.title} off the client's page`}
                      title="Take off the client’s page"
                      disabled={busyId === version.id}
                      onClick={() => void handleHide(version.id)}
                    >
                      {busyId === version.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                  </span>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => startVersion(deliverable.id)}
              >
                <Plus className="h-3 w-3" />
                New version
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={startAdd}>
        <Plus className="h-3.5 w-3.5" />
        Add deliverable
      </Button>

      <Dialog open={!!editing} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Shown on the client&apos;s page under &ldquo;What we&apos;ve handed over&rdquo;, and kept on the Links tab.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="deliverable-title" className="text-xs text-muted-foreground">Title</Label>
                <Input
                  id="deliverable-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ title: e.target.value })}
                  placeholder="India event founders list"
                  maxLength={160}
                  autoFocus
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deliverable-url" className="text-xs text-muted-foreground">Link</Label>
                <Input
                  id="deliverable-url"
                  value={draft.url}
                  onChange={(e) => setDraft({ url: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/…"
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_80px]">
                <div className="space-y-1.5">
                  <Label htmlFor="deliverable-date" className="text-xs text-muted-foreground">Shared on</Label>
                  <Input
                    id="deliverable-date"
                    type="date"
                    value={draft.sharedAt}
                    onChange={(e) => setDraft({ sharedAt: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="deliverable-with" className="text-xs text-muted-foreground">Shared with</Label>
                  <Input
                    id="deliverable-with"
                    value={draft.sharedWith}
                    onChange={(e) => setDraft({ sharedWith: e.target.value })}
                    placeholder="Shruthi"
                    maxLength={200}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="deliverable-version" className="text-xs text-muted-foreground">Version</Label>
                  <Input
                    id="deliverable-version"
                    type="number"
                    min={1}
                    max={999}
                    value={draft.version ?? ''}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      setDraft({ version: Number.isNaN(n) ? undefined : n });
                    }}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The client sees the names you write here. Names only: an email address is left off their page.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving || !draft.title.trim() || !draft.url.trim()}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
