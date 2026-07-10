'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Sparkles,
  LayoutGrid,
  List,
  FolderOpen,
  Building2,
  GanttChartSquare,
  Users,
} from 'lucide-react';
import { useAuth } from '@/modules/auth-access';
import { type Project, type ProjectTag } from '@/modules/project-links';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { DailyReviewBanner } from '@/components/projects/DailyReviewBanner';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AppNavigation } from '@/shared/ui';
import { toast } from 'sonner';
import { DashboardToolbar, type StatusFilter } from '@/modules/project-links/ui/components/DashboardToolbar';

const MAINTENANCE_TAGS: ProjectTag[] = ['retainer', 'maintenance', 'subscription'];
const ACTIVE_TAGS: ProjectTag[] = ['one_time', 'consulting'];

export function ProjectLinksDashboardScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupByClient, setGroupByClient] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('maintenance');
  const [activeTags, setActiveTags] = useState<ProjectTag[]>([]);
  const { isLoading: isCreatingProject, execute: executeCreateProject } = useAsyncOperation<string>();

  useEffect(() => {
    if (!user) return;

    const unsubscribe = projectLinksRepository.subscribeToAllProjects(
      (updatedProjects) => {
        setProjects(updatedProjects);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleCreateProject = async () => {
    if (!user || !newProjectName.trim()) return;

    const trimmedName = newProjectName.trim();
    const projectId = await executeCreateProject(async () => {
      return await projectLinksRepository.createProject(user.uid, trimmedName);
    });

    if (projectId) {
      setNewProjectName('');
      setIsCreating(false);
      // New projects start with no tags, so the default 'maintenance' filter
      // would hide them. Switch to 'all' and clear tag chips so the user
      // actually sees the project they just created.
      setStatusFilter('all');
      setActiveTags([]);
      toast.success(`Project "${trimmedName}" created`);
    } else {
      toast.error('Failed to create project. See console for details.');
    }
  };

  const handleDeleteProject = useCallback((projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }, []);

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
        if (statusFilter === 'paused' || statusFilter === 'closed' || statusFilter === 'paid') {
          if (projectStatus !== statusFilter) return false;
        } else {
          if (projectStatus !== 'current') return false;
          const bucketTags = statusFilter === 'maintenance' ? MAINTENANCE_TAGS : ACTIVE_TAGS;
          const projectTags = project.tags || [];
          if (!bucketTags.some(tag => projectTags.includes(tag))) return false;
        }
      }
      // Tag filter — project must have ALL active tags
      if (activeTags.length > 0) {
        const projectTags = project.tags || [];
        if (!activeTags.every(tag => projectTags.includes(tag))) return false;
      }
      return true;
    });
  }, [projects, searchQuery, statusFilter, activeTags]);

  // Group by client (stable alphabetical, unassigned last)
  const groupedProjects = useMemo(() => {
    const groups = new Map<string, Project[]>();
    const unassigned: Project[] = [];
    for (const project of filteredProjects) {
      const client = project.client?.trim();
      if (!client) {
        unassigned.push(project);
        continue;
      }
      const existing = groups.get(client);
      if (existing) {
        existing.push(project);
      } else {
        groups.set(client, [project]);
      }
    }
    const sortedGroups: Array<{ client: string | null; projects: Project[] }> =
      Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([client, projects]) => ({ client, projects }));
    if (unassigned.length > 0) {
      sortedGroups.push({ client: null, projects: unassigned });
    }
    return sortedGroups;
  }, [filteredProjects]);

  // Counts — single pass over projects, recomputed only when projects change.
  const {
    maintenanceCount, activeCount, pausedCount, closedCount, paidCount,
    currentCount, runningScanCount, connectedSystemCount, unassignedCurrentCount,
  } = useMemo(() => {
    const c = {
      maintenanceCount: 0, activeCount: 0, pausedCount: 0, closedCount: 0, paidCount: 0,
      currentCount: 0, runningScanCount: 0, connectedSystemCount: 0, unassignedCurrentCount: 0,
    };
    for (const p of projects) {
      const status = p.status || 'current';
      const tags = p.tags || [];
      if (status === 'current') {
        c.currentCount++;
        if (MAINTENANCE_TAGS.some(t => tags.includes(t))) c.maintenanceCount++;
        if (ACTIVE_TAGS.some(t => tags.includes(t))) c.activeCount++;
        if ((p.assigneeEmails?.length ?? 0) === 0) c.unassignedCurrentCount++;
      } else if (status === 'paused') {
        c.pausedCount++;
      } else if (status === 'closed') {
        c.closedCount++;
      } else if (status === 'paid') {
        c.paidCount++;
      }
      if (p.imageScanJob?.status === 'running') c.runningScanCount++;
      if (p.clickupListId || p.webflowConfig || p.sitemapUrl) c.connectedSystemCount++;
    }
    return c;
  }, [projects]);

  const statusOptions: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: projects.length },
    { value: 'maintenance', label: 'Maintenance', count: maintenanceCount },
    { value: 'active', label: 'Active', count: activeCount },
    { value: 'paused', label: 'Paused', count: pausedCount },
    { value: 'closed', label: 'Closed', count: closedCount },
    { value: 'paid', label: 'Paid', count: paidCount },
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
          <div className="container mx-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            {/* Page Header */}
            <div className="mb-4 sm:mb-6 lg:mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold tracking-tight">All Projects</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentCount} current · {unassignedCurrentCount} unassigned · {connectedSystemCount} connected
                    {runningScanCount > 0 ? ` · ${runningScanCount} scanning` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2 shrink-0">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                    className="h-10 sm:h-8"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                    className="h-10 sm:h-8"
                  >
                    <List className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">List</span>
                  </Button>
                  <Button
                    variant={groupByClient ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setGroupByClient(prev => !prev)}
                    aria-label="Group by client"
                    aria-pressed={groupByClient}
                    className="h-10 sm:h-8"
                  >
                    <Users className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">By Client</span>
                  </Button>
                </div>
              </div>

              <DashboardToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                statusOptions={statusOptions}
                activeTags={activeTags}
                onToggleTag={toggleTag}
                onClearTags={() => setActiveTags([])}
                onNewProject={() => setIsCreating(true)}
              />

              {/* Create Project Form */}
              {isCreating && (
                <Card className="mt-4">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Input
                        placeholder="Enter project name..."
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                        autoFocus
                        className="h-11 flex-1 sm:h-9"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCreateProject}
                          disabled={!newProjectName.trim() || isCreatingProject}
                          className="h-11 flex-1 sm:h-9 sm:flex-none"
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
                          className="h-11 flex-1 sm:h-9 sm:flex-none"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Daily review banner — only renders when there are current projects */}
            <DailyReviewBanner projects={projects} className="mb-4 sm:mb-6" />

            {/* Projects Grid/List */}
            {filteredProjects.length > 0 ? (
              groupByClient ? (
                <div className="space-y-8">
                  {groupedProjects.map(({ client, projects: clientProjects }) => (
                    <section key={client ?? '__unassigned__'}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-border/60">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className={cn(
                            "h-4 w-4 shrink-0",
                            client ? "text-muted-foreground" : "text-muted-foreground/40"
                          )} />
                          <h2 className={cn(
                            "text-sm sm:text-base font-semibold tracking-tight truncate",
                            !client && "text-muted-foreground italic"
                          )}>
                            {client ?? 'Unassigned'}
                          </h2>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                            {clientProjects.length}
                          </Badge>
                        </div>
                        {client && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs shrink-0"
                          >
                            <Link href={`/modules/project-links/clients/${encodeURIComponent(client)}`}>
                              <GanttChartSquare className="h-3.5 w-3.5 mr-1.5" />
                              View combined timeline
                            </Link>
                          </Button>
                        )}
                      </div>
                      <div className={cn(
                        viewMode === 'grid'
                          ? "grid gap-3 sm:gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-3"
                          : "space-y-3 sm:space-y-4"
                      )}>
                        {clientProjects.map((project) => (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            onDelete={handleDeleteProject}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={cn(
                  viewMode === 'grid'
                    ? "grid gap-3 sm:gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-3"
                    : "space-y-3 sm:space-y-4"
                )}>
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onDelete={handleDeleteProject}
                    />
                  ))}
                </div>
              )
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center px-4 py-12 text-center">
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
