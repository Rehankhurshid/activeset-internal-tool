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
    <Card className="bg-card rounded-xl shadow-sm border border-border">
      <CardHeader className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          {isEditing ? (
             <div className="flex items-center gap-2 w-full">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                disabled={isLoading}
                className="text-base font-medium"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveName} disabled={isLoading}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          ) : (
            <>
              <h3 className="text-base font-medium tracking-tight">{project.name}</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  <LinkIcon className="h-3 w-3 mr-1.5" />
                  {project.links.length} links
                </Badge>
                <Badge variant="outline" className="font-normal">
                  <span className="h-2 w-2 mr-1.5 bg-green-500 rounded-full"></span>
                  Live
                </Badge>
                 <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAddLink}><Plus className="mr-2 h-4 w-4" />Add Link</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsEmbedDialogOpen(true)}><Code className="mr-2 h-4 w-4" />Embed</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} className="text-red-600"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-2">
        <LinkList projectId={project.id} links={project.links} />
        {project.links.length > 0 && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleAddLink}
            className="w-full text-muted-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Link
          </Button>
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