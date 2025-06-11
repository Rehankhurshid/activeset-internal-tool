'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Plus, Code, Link as LinkIcon } from 'lucide-react';
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
    <Card className="group relative overflow-hidden border-2 border-border/50 bg-gradient-to-br from-card to-card/80 backdrop-blur-sm transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            {isEditing ? (
              <div className="space-y-3">
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
                  className="text-base font-semibold border-primary/50 focus:border-primary"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveName}
                    disabled={isLoading || !projectName.trim()}
                    className="h-7 px-3"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProjectName(project.name);
                      setIsEditing(false);
                    }}
                    className="h-7 px-3"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent group-hover:from-foreground group-hover:to-foreground transition-all duration-300">
                  {project.name}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 text-xs gap-1">
                    <LinkIcon className="h-3 w-3" />
                    {project.links.length} {project.links.length === 1 ? 'link' : 'links'}
                  </Badge>
                  <Badge variant="outline" className="h-5 text-xs gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </Badge>
                </div>
              </div>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsEditing(true)} className="gap-2">
                <Edit className="h-4 w-4" />
                Rename Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddLink} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEmbedDialogOpen(true)} className="gap-2">
                <Code className="h-4 w-4" />
                Get Embed Code
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleDelete} 
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="relative space-y-4">
        {project.links.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <LinkIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">No links yet</p>
              <p className="text-xs text-muted-foreground">Add your first link to get started</p>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleAddLink}
              className="gap-2 text-xs"
            >
              <Plus className="h-3 w-3" />
              Add Link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <LinkList projectId={project.id} links={project.links} />
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleAddLink}
              className="w-full gap-2 h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            >
              <Plus className="h-3 w-3" />
              Add Another Link
            </Button>
          </div>
        )}
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