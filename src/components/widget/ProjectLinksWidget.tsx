'use client';

import React from 'react';
import { Check, Copy, ExternalLink, Link2, Loader2, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectLink } from '@/types';
import { projectsService } from '@/services/database';

interface ProjectLinksWidgetProps {
  projectId: string;
  isAuthenticated?: boolean;
  onSignIn?: () => void;
}

interface LinkDraft {
  title: string;
  url: string;
}

const normalizeUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // Validate URL before saving
    new URL(candidate);
    return candidate;
  } catch {
    return null;
  }
};

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
};

export function ProjectLinksWidget({
  projectId,
  isAuthenticated = false,
  onSignIn,
}: ProjectLinksWidgetProps) {
  const [links, setLinks] = React.useState<ProjectLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [isMutating, setIsMutating] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState<LinkDraft>({ title: '', url: '' });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<LinkDraft>({ title: '', url: '' });

  React.useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    const unsubscribe = projectsService.subscribeToProject(projectId, (project) => {
      if (!project) {
        setLinks([]);
        setLoading(false);
        setError('Project not found.');
        return;
      }

      const manualLinks = (project.links || [])
        .filter((link) => link.source !== 'auto')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      setLinks(manualLinks);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId]);

  const handleCopyLink = async (link: ProjectLink) => {
    if (!link.url) return;

    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === link.id ? null : current));
      }, 1400);
    } catch {
      setError('Could not copy link to clipboard.');
    }
  };

  const startEdit = (link: ProjectLink) => {
    setError(null);
    setEditingId(link.id);
    setEditDraft({ title: link.title, url: link.url });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({ title: '', url: '' });
  };

  const submitEdit = async (linkId: string) => {
    if (!isAuthenticated || isMutating) return;
    const normalizedUrl = normalizeUrl(editDraft.url);
    if (!editDraft.title.trim()) {
      setError('Link title is required.');
      return;
    }
    if (!normalizedUrl) {
      setError('Enter a valid URL.');
      return;
    }

    setIsMutating(true);
    setError(null);
    try {
      await projectsService.updateLink(projectId, linkId, {
        title: editDraft.title.trim(),
        url: normalizedUrl,
      });
      cancelEdit();
    } catch (e) {
      console.error('Failed to update link', e);
      setError('Failed to update link.');
    } finally {
      setIsMutating(false);
    }
  };

  const submitNewLink = async () => {
    if (!isAuthenticated || isMutating) return;
    const normalizedUrl = normalizeUrl(newDraft.url);
    if (!newDraft.title.trim()) {
      setError('Link title is required.');
      return;
    }
    if (!normalizedUrl) {
      setError('Enter a valid URL.');
      return;
    }

    const maxOrder = links.reduce((acc, link) => Math.max(acc, link.order ?? 0), -1);

    setIsMutating(true);
    setError(null);
    try {
      await projectsService.addLinkToProject(projectId, {
        title: newDraft.title.trim(),
        url: normalizedUrl,
        order: maxOrder + 1,
        isDefault: false,
        source: 'manual',
      });
      setNewDraft({ title: '', url: '' });
      setIsAdding(false);
    } catch (e) {
      console.error('Failed to add link', e);
      setError('Failed to add link.');
    } finally {
      setIsMutating(false);
    }
  };

  const deleteLink = async (link: ProjectLink) => {
    if (!isAuthenticated || isMutating) return;
    const confirmed = window.confirm(`Delete "${link.title}"?`);
    if (!confirmed) return;

    setIsMutating(true);
    setError(null);
    try {
      await projectsService.deleteLink(projectId, link.id);
    } catch (e) {
      console.error('Failed to delete link', e);
      setError('Failed to delete link.');
    } finally {
      setIsMutating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {!isAuthenticated && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">Sign in to add, edit, or delete links</span>
          {onSignIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignIn}
              className="h-6 px-2 text-xs hover:bg-amber-500/20 hover:text-amber-300 -my-1 font-medium"
            >
              Sign In
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="text-xs px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        {links.length === 0 ? (
          <div className="py-10 px-4 text-center text-muted-foreground text-sm">
            No links yet.
          </div>
        ) : (
          links.map((link) => (
            <div key={link.id} className="border-b border-border/70 last:border-b-0">
              {editingId === link.id ? (
                <div className="p-3 space-y-2 bg-muted/30">
                  <Input
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((current) => ({ ...current, title: e.target.value }))}
                    placeholder="Link title"
                    disabled={isMutating}
                  />
                  <Input
                    value={editDraft.url}
                    onChange={(e) => setEditDraft((current) => ({ ...current, url: e.target.value }))}
                    placeholder="https://..."
                    disabled={isMutating}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={isMutating}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => submitEdit(link.id)} disabled={isMutating}>
                      {isMutating ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <a
                    href={link.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 group"
                    onClick={(event) => {
                      if (!link.url) event.preventDefault();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium truncate group-hover:underline">{link.title}</span>
                      {link.url && <ExternalLink className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground truncate pl-5">
                      {link.url ? getHostname(link.url) : 'No URL set yet'}
                    </div>
                  </a>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleCopyLink(link)}
                    title="Copy link"
                    disabled={!link.url}
                  >
                    {copiedId === link.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>

                  {isAuthenticated && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(link)}
                        title="Edit link"
                        disabled={isMutating}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteLink(link)}
                        title="Delete link"
                        disabled={isMutating}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isAuthenticated && (
        isAdding ? (
          <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
            <Input
              value={newDraft.title}
              onChange={(e) => setNewDraft((current) => ({ ...current, title: e.target.value }))}
              placeholder="Link title"
              disabled={isMutating}
            />
            <Input
              value={newDraft.url}
              onChange={(e) => setNewDraft((current) => ({ ...current, url: e.target.value }))}
              placeholder="https://..."
              disabled={isMutating}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setNewDraft({ title: '', url: '' });
                }}
                disabled={isMutating}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submitNewLink} disabled={isMutating}>
                {isMutating ? 'Adding...' : 'Add Link'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              setError(null);
              setIsAdding(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Link
          </Button>
        )
      )}
    </div>
  );
}
