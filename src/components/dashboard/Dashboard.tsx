'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, LogOut, User, Sparkles, Zap, Layers } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { ProjectCard } from '@/components/projects/ProjectCard';

export function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Subscribe to real-time updates
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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-muted border-t-primary mx-auto"></div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-primary/0 animate-pulse"></div>
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium">Loading Dashboard</p>
            <p className="text-sm text-muted-foreground">Syncing your projects...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
                  <Layers className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                    Project Links
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Real-time collaboration platform
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                Live
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-3 py-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{user?.email}</span>
              </div>
              <Button variant="outline" size="sm" onClick={logout} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
            Welcome back, {user?.email?.split('@')[0]}
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Organize, share, and collaborate on your project links with real-time synchronization across your team.
          </p>
        </div>

        {/* Create Project Section */}
        <div className="mb-12">
          {isCreating ? (
            <Card className="max-w-md mx-auto border-2 border-dashed border-muted-foreground/25 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-1">Create New Project</h3>
                    <p className="text-sm text-muted-foreground">Give your project a memorable name</p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      placeholder="e.g., My Awesome Project"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateProject();
                        if (e.key === 'Escape') {
                          setIsCreating(false);
                          setNewProjectName('');
                        }
                      }}
                      autoFocus
                      className="text-center"
                    />
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleCreateProject} 
                        disabled={!newProjectName.trim()}
                        className="flex-1 gap-2"
                      >
                        <Zap className="h-4 w-4" />
                        Create Project
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsCreating(false);
                          setNewProjectName('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center">
              <Button 
                onClick={() => setIsCreating(true)} 
                size="lg"
                className="gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Plus className="h-5 w-5" />
                Create New Project
              </Button>
            </div>
          )}
        </div>

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <Card className="max-w-lg mx-auto border-dashed border-muted-foreground/25 bg-gradient-to-br from-card to-muted/20">
            <CardContent className="p-12 text-center">
              <div className="space-y-6">
                <div className="relative">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mx-auto">
                    <Plus className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">Ready to get started?</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Create your first project to start organizing and sharing your links with real-time collaboration.
                  </p>
                </div>
                <Button 
                  onClick={() => setIsCreating(true)}
                  variant="outline" 
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Get Started
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Your Projects</h3>
                <p className="text-sm text-muted-foreground">
                  {projects.length} {projects.length === 1 ? 'project' : 'projects'} • Real-time sync enabled
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                Live
              </Badge>
            </div>
            
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
      </main>
    </div>
  );
} 