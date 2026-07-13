'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FolderOpen } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import type { Project } from '@/types';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

/**
 * Global ⌘K / Ctrl+K command palette for jumping to any project. Mounted once
 * in AppProviders. Renders nothing until a user is signed in (the projects
 * collection is only readable by authenticated ActiveSet users). Other windows
 * can open it by dispatching a `commandk:open` window event.
 */
export function CommandPalette() {
  const { user } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Global keyboard shortcut + optional custom-event trigger.
  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvent = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('commandk:open', onOpenEvent);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('commandk:open', onOpenEvent);
    };
  }, [user]);

  // Subscribe to the project list only while the palette is open — fresh each
  // time, no persistent app-wide listener.
  useEffect(() => {
    if (!open || !user) return;
    const unsub = projectLinksRepository.subscribeToAllProjects((list) => {
      setProjects(list);
      setLoaded(true);
    });
    return () => unsub();
  }, [open, user]);

  if (!user) return null;

  const goToProject = (id: string) => {
    setOpen(false);
    router.push(`/modules/project-links/${id}`);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search projects"
      description="Search and jump to any project"
      className="sm:max-w-xl"
    >
      <CommandInput placeholder="Search projects by name or client…" />
      <CommandList>
        <CommandEmpty>{loaded ? 'No projects found.' : 'Loading projects…'}</CommandEmpty>
        <CommandGroup heading={`Projects${projects.length ? ` (${projects.length})` : ''}`}>
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              // Include the id so items with duplicate name+client stay distinct
              // for cmdk; filtering still matches on name/client substrings.
              value={`${project.name} ${project.client ?? ''} ${project.id}`}
              onSelect={() => goToProject(project.id)}
            >
              <FolderOpen className="text-muted-foreground" />
              <span className="truncate">{project.name}</span>
              {project.client && (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="size-3" />
                  {project.client}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
