'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, LogOut, User, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ModeToggle } from '@/components/mode-toggle';

export function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = projectsService.subscribeToUserProjects(
      user.uid,
      (updatedProjects) => {
        setProjects(updatedProjects);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleCreateProject = async () => {
    if (!user || !newProjectName.trim()) return;
    try {
      await projectsService.createProject(user.uid, newProjectName.trim());
      setNewProjectName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects(projects.filter(p => p.id !== projectId));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading your projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 7L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 22V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 7L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 4.5L7 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">Project Links</span>
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>Real-time collaboration platform</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{user?.email}</span>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-10">
            <h2 className="text-2xl font-medium mb-2">
              Organize, share, and collaborate on your project links with real-time synchronization
            </h2>
          </div>

          {/* Create Project Section */}
          <div className="mb-10 text-center">
             <Button onClick={() => setIsCreating(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create New Project
            </Button>
          </div>

          {isCreating && (
            <div className="max-w-md mx-auto mb-10">
              <div className="flex items-center gap-2 border rounded-lg p-2 bg-card">
                <Input
                  placeholder="Enter project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                  autoFocus
                  className="border-none focus-visible:ring-0 bg-transparent"
                />
                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>Create</Button>
                <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Projects Section */}
          {projects.length > 0 && (
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-medium">Your Projects</h3>
                <p className="text-sm text-muted-foreground">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'} • Real-time sync enabled
                </p>
              </div>
              <div className="space-y-6">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 