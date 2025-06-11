'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Plus, Code } from 'lucide-react';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { LinkList } from './LinkList';
import { EmbedDialog } from './EmbedDialog';

interface ProjectCardProps {
  project: Project;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);

  const handleSaveName = async () => {
    if (projectName.trim() === project.name) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      await projectsService.updateProjectName(project.id, projectName.trim());
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update project name:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      setIsLoading(true);
      try {
        await projectsService.deleteProject(project.id);
        onDelete(project.id);
      } catch (error) {
        console.error('Failed to delete project:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleAddLink = async () => {
    const title = prompt('Enter link title:');
    if (!title) return;

    const url = prompt('Enter URL:');
    if (!url) return;

    try {
      await projectsService.addLinkToProject(project.id, {
        title: title.trim(),
        url: url.trim(),
        order: project.links.length,
        isDefault: false,
      });
    } catch (error) {
      console.error('Failed to add link:', error);
    }
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') {
                    setProjectName(project.name);
                    setIsEditing(false);
                  }
                }}
                disabled={isLoading}
                className="text-lg font-semibold"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleSaveName}
                disabled={isLoading}
              >
                Save
              </Button>
            </div>
          ) : (
            <h3 className="text-lg font-semibold tracking-tight">{project.name}</h3>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAddLink}>
              <Plus className="mr-2 h-4 w-4" />
              Add Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEmbedDialogOpen(true)}>
              <Code className="mr-2 h-4 w-4" />
              Embed Code
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <LinkList projectId={project.id} links={project.links} />
      </CardContent>
      
      <EmbedDialog 
        isOpen={isEmbedDialogOpen}
        onOpenChange={setIsEmbedDialogOpen}
        projectId={project.id}
        projectName={project.name}
      />
    </Card>
  );
} 