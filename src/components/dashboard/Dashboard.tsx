'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Sparkles, Search, LayoutGrid, List, FolderOpen, Link as LinkIcon, Filter } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Project, ProjectStatus, ProjectTag, PROJECT_TAG_LABELS } from '@/types';
import { projectsService } from '@/services/database';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Card, CardContent } from "@/components/ui/card";
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AppNavigation } from '@/components/navigation/AppNavigation';

type StatusFilter = 'all' | ProjectStatus;

const TAG_FILTER_COLORS: Record<ProjectTag, string> = {
  retainer: 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20',
  one_time: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
  subscription: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20',
  maintenance: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
  consulting: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
};

const ALL_TAGS: ProjectTag[] = ['retainer', 'one_time', 'subscription', 'maintenance', 'consulting'];

export function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTags, setActiveTags] = useState<ProjectTag[]>([]);
  const { isLoading: isCreatingProject, execute: executeCreateProject } = useAsyncOperation();

  useEffect(() => {
    if (!user) return;

    const unsubscribe = projectsService.subscribeToAllProjects(
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

  const toggleTag = (tag: ProjectTag) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      // Search filter
      if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        const projectStatus = project.status || 'current';
        if (projectStatus !== statusFilter) return false;
      }
      // Tag filter — project must have ALL active tags
      if (activeTags.length > 0) {
        const projectTags = project.tags || [];
        if (!activeTags.every(tag => projectTags.includes(tag))) return false;
      }
      return true;
    });
  }, [projects, searchQuery, statusFilter, activeTags]);

  // Counts
  const currentCount = projects.filter(p => (p.status || 'current') === 'current').length;
  const pastCount = projects.filter(p => p.status === 'past').length;
  const totalManualLinks = projects.reduce((acc, p) =>
    acc + (p.links?.filter(l => l.source !== 'auto').length || 0), 0
  );

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
        <AppNavigation
          title="Client Projects"
          showBackButton
          backHref="/"
        >
          <Badge variant="secondary" className="hidden sm:inline-flex">
            <Sparkles className="h-3 w-3 mr-1" />
            Live Sync
          </Badge>
        </AppNavigation>

        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {/* Page Header */}
            <div className="mb-4 sm:mb-6 lg:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">All Projects</h1>
                  <p className="text-muted-foreground mt-1 text-xs sm:text-sm lg:text-base">
                    Manage client projects (shared access)
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">List</span>
                  </Button>
                </div>
              </div>

              {/* Search and Create Row */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full"
                    aria-label="Search projects"
                  />
                </div>
                <Button
                  onClick={() => setIsCreating(true)}
                  className="w-full sm:w-auto shrink-0"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">New Project</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </div>

              {/* Create Project Form */}
              {isCreating && (
                <Card className="mt-4">
                  <CardContent className="pt-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Input
                        placeholder="Enter project name..."
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                        autoFocus
                        className="flex-1"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCreateProject}
                          disabled={!newProjectName.trim() || isCreatingProject}
                          className="flex-1 sm:flex-none"
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
                          className="flex-1 sm:flex-none"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Filters row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
                {/* Status filter tabs */}
                <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/50">
                  {([
                    { value: 'all' as StatusFilter, label: 'All', count: projects.length },
                    { value: 'current' as StatusFilter, label: 'Current', count: currentCount },
                    { value: 'past' as StatusFilter, label: 'Past', count: pastCount },
                  ]).map(({ value, label, count }) => (
                    <button
                      key={value}
                      onClick={() => setStatusFilter(value)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                        statusFilter === value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                      <span className={cn(
                        "ml-1.5 text-[10px]",
                        statusFilter === value ? "text-muted-foreground" : "text-muted-foreground/60"
                      )}>
                        {count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Tag filter chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  {ALL_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all duration-200",
                        activeTags.includes(tag)
                          ? TAG_FILTER_COLORS[tag]
                          : "text-muted-foreground/60 border-border/30 bg-transparent hover:border-border hover:text-muted-foreground"
                      )}
                    >
                      {PROJECT_TAG_LABELS[tag]}
                    </button>
                  ))}
                  {activeTags.length > 0 && (
                    <button
                      onClick={() => setActiveTags([])}
                      className="text-[10px] text-muted-foreground/60 hover:text-foreground ml-1 underline underline-offset-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Stats Badges */}
              <div className="flex items-center gap-3 mt-3">
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
                </Badge>
                <Badge variant="outline" className="text-sm py-1 px-3">
                  <LinkIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {totalManualLinks} Links
                </Badge>
              </div>
            </div>

            {/* Projects Grid/List */}
            {filteredProjects.length > 0 ? (
              <div className={cn(
                viewMode === 'grid'
                  ? "grid gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-3"
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
                    {searchQuery || statusFilter !== 'all' || activeTags.length > 0
                      ? 'Try adjusting your filters'
                      : 'Create your first project to get started'}
                  </p>
                  {!searchQuery && statusFilter === 'all' && activeTags.length === 0 && (
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
    </ErrorBoundary>
  );
}