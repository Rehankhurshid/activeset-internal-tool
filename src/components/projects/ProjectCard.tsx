'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Plus, Code } from 'lucide-react';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { LinkList } from './LinkList';
import { EmbedDialog } from './EmbedDialog';
import { AddLinkDialog } from './AddLinkDialog';
import { ProjectStats } from './ProjectStats';
import { ConfirmDialog } from "@/components/ui/alert-dialog-confirm";
import { InlineEdit } from '@/components/ui/inline-edit';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';

interface ProjectCardProps {
  project: Project;
  onDelete: (projectId: string) => void;
}

export const ProjectCard = React.memo(function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);
  const { isLoading: isDeleting, execute: executeDelete } = useAsyncOperation();
  const { execute: executeAddLink } = useAsyncOperation();

  const handleSaveName = useCallback(async (name: string) => {
    await projectsService.updateProjectName(project.id, name);
  }, [project.id]);

  const handleDelete = useCallback(async () => {
    const success = await executeDelete(() => projectsService.deleteProject(project.id));
    if (success) {
      onDelete(project.id);
    }
  }, [executeDelete, project.id, onDelete]);

  const handleAddLink = useCallback(async (title: string, url: string) => {
    await projectsService.addLinkToProject(project.id, {
      title,
      url,
      order: project.links.length,
      isDefault: false,
    });
  }, [project.id, project.links.length]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <InlineEdit
            value={project.name}
            onSave={handleSaveName}
            placeholder="Project name"
            className="text-lg font-semibold"
            renderDisplay={(value, startEditing) => (
              <h3 className="text-lg font-semibold cursor-pointer hover:text-primary" onClick={startEditing}>
                {value}
              </h3>
            )}
          />
          <div className="flex items-center gap-2">
            <ProjectStats linkCount={project.links.length} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isDeleting}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <AddLinkDialog
                  onAddLink={async (title, url) => {
                    await executeAddLink(() => handleAddLink(title, url));
                  }}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Link
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem onClick={() => setIsEmbedDialogOpen(true)}>
                  <Code className="mr-2 h-4 w-4" />
                  Embed
                </DropdownMenuItem>
                <ConfirmDialog title="Delete project?" confirmLabel="Delete" onConfirm={handleDelete}>
                  {(open) => (
                    <DropdownMenuItem onClick={open} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </ConfirmDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <LinkList projectId={project.id} links={project.links} />
        <AddLinkDialog
          onAddLink={async (title, url) => {
            await executeAddLink(() => handleAddLink(title, url));
          }}
        />
      </CardContent>
      
      <EmbedDialog 
        isOpen={isEmbedDialogOpen}
        onOpenChange={setIsEmbedDialogOpen}
        projectId={project.id}
        projectName={project.name}
      />
    </Card>
  );
}); 