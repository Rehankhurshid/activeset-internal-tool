'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, LogOut, User, Sparkles, Search, LayoutGrid, List, FolderOpen, Clock, Star, Archive, Settings, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Project } from '@/types';
import { projectsService } from '@/services/database';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ModeToggle } from '@/components/mode-toggle';
import { Card, CardContent } from "@/components/ui/card";
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { isLoading: isCreatingProject, execute: executeCreateProject } = useAsyncOperation();

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

    const success = await executeCreateProject(async () => {
      await projectsService.createProject(user.uid, newProjectName.trim());
    });

    if (success) {
      setNewProjectName('');
      setIsCreating(false);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
  };

  // Filter projects based on search query
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sidebar navigation items
  const sidebarItems = [
    { id: 'all', label: 'All Projects', icon: FolderOpen, count: projects.length },
    { id: 'recent', label: 'Recent', icon: Clock, count: 0 },
    { id: 'starred', label: 'Starred', icon: Star, count: 0 },
    { id: 'archived', label: 'Archived', icon: Archive, count: 0 },
  ];

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
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4 flex-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 7L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 22V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 7L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 4.5L7 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-semibold text-lg">Project Links</span>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                <Sparkles className="h-3 w-3 mr-1" />
                Real-time Sync
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{user?.email}</span>
              </div>
              <ModeToggle />
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline-flex ml-2">Sign Out</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Layout with Sidebar and Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="hidden lg:flex w-64 flex-col gap-4 border-r bg-muted/10">
            <ScrollArea className="flex-1 px-4 py-6">
              {/* Search */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Create Button */}
              <div className="mb-6">
                <Button
                  onClick={() => setIsCreating(true)}
                  className="w-full justify-start"
                  variant="default"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Project
                </Button>
              </div>

              {/* Navigation */}
              <nav className="space-y-1">
                {sidebarItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedCategory(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                      selectedCategory === item.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {item.count > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {item.count}
                      </Badge>
                    )}
                  </button>
                ))}
              </nav>

              <Separator className="my-6" />

              {/* Settings */}
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Settings className="h-4 w-4" />
                Settings
              </button>
            </ScrollArea>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-6 lg:p-8">
              {/* Content Header */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Your Projects</h1>
                    <p className="text-muted-foreground mt-1">
                      Manage and organize your project links in one place
                    </p>
                  </div>
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Mobile Search (visible on small screens) */}
                <div className="lg:hidden mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Mobile Create Button */}
                <div className="lg:hidden mb-6">
                  <Button
                    onClick={() => setIsCreating(true)}
                    className="w-full"
                    variant="default"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Project
                  </Button>
                </div>

                {/* Create Project Form */}
                {isCreating && (
                  <Card className="mb-6">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Enter project name..."
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                          autoFocus
                          className="flex-1"
                        />
                        <Button
                          onClick={handleCreateProject}
                          disabled={!newProjectName.trim() || isCreatingProject}
                        >
                          {isCreatingProject ? 'Creating...' : 'Create'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsCreating(false);
                            setNewProjectName('');
                          }}
                          disabled={isCreatingProject}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-4 mb-8">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Projects</p>
                          <p className="text-2xl font-bold">{projects.length}</p>
                        </div>
                        <FolderOpen className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Links</p>
                          <p className="text-2xl font-bold">
                            {projects.reduce((acc, p) => acc + (p.links?.length || 0), 0)}
                          </p>
                        </div>
                        <ChevronRight className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Recent</p>
                          <p className="text-2xl font-bold">0</p>
                        </div>
                        <Clock className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Starred</p>
                          <p className="text-2xl font-bold">0</p>
                        </div>
                        <Star className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Projects Grid/List */}
              {filteredProjects.length > 0 ? (
                <div className={cn(
                  viewMode === 'grid'
                    ? "grid gap-6 md:grid-cols-2 xl:grid-cols-3"
                    : "space-y-4"
                )}>
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={handleDeleteProject}
                    />
                  ))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-1">No projects found</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {searchQuery ? 'Try a different search term' : 'Create your first project to get started'}
                    </p>
                    {!searchQuery && (
                      <Button onClick={() => setIsCreating(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Project
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}