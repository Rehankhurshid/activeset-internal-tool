'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Sparkles,
  Search,
  LayoutGrid,
  List,
  FolderOpen,
  Link as LinkIcon,
  Filter,
  Building2,
  GanttChartSquare,
  Users,
  Activity,
  Clock3,
  RadioTower,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/modules/auth-access';
import { type Project, type ProjectTag } from '@/modules/project-links';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import { PROJECT_TAG_LABELS } from '@/types';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { DailyReviewBanner } from '@/components/projects/DailyReviewBanner';
import { Card, CardContent } from "@/components/ui/card";
import { useAsyncOperation } from '@/hooks/useAsyncOperation';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AppNavigation } from '@/shared/ui';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'maintenance' | 'active' | 'closed' | 'paid';

const TAG_FILTER_COLORS: Record<ProjectTag, string> = {
  retainer: 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20',
  one_time: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
  subscription: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20',
  maintenance: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
  consulting: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
};

const ALL_TAGS: ProjectTag[] = ['retainer', 'one_time', 'subscription', 'maintenance', 'consulting'];
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
        if (statusFilter === 'closed' || statusFilter === 'paid') {
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

  // Counts
  const maintenanceCount = projects.filter(p => {
    const status = p.status || 'current';
    if (status !== 'current') return false;
    const tags = p.tags || [];
    return MAINTENANCE_TAGS.some(t => tags.includes(t));
  }).length;
  const activeCount = projects.filter(p => {
    const status = p.status || 'current';
    if (status !== 'current') return false;
    const tags = p.tags || [];
    return ACTIVE_TAGS.some(t => tags.includes(t));
  }).length;
  const closedCount = projects.filter(p => p.status === 'closed').length;
  const paidCount = projects.filter(p => p.status === 'paid').length;
  const totalManualLinks = projects.reduce((acc, p) =>
    acc + (p.links?.filter(l => l.source !== 'auto').length || 0), 0
  );
  const currentCount = projects.filter(p => (p.status || 'current') === 'current').length;
  const runningScanCount = projects.filter(p => p.imageScanJob?.status === 'running').length;
  const connectedSystemCount = projects.filter(p => p.clickupListId || p.webflowConfig || p.sitemapUrl).length;
  const assignedPeopleCount = new Set(projects.flatMap(p => p.assigneeEmails ?? [])).size;
  const unassignedCurrentCount = projects.filter(p =>
    (p.status || 'current') === 'current' && (p.assigneeEmails?.length ?? 0) === 0
  ).length;

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
                  <div className="flex items-center gap-2">
                    <span className="work-live-dot h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">All Projects</h1>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs sm:text-sm lg:text-base">
                    {currentCount} active projects moving across build, QA, review, and handoff.
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

              <OperationsPulsePanel
                filteredCount={filteredProjects.length}
                currentCount={currentCount}
                runningScanCount={runningScanCount}
                connectedSystemCount={connectedSystemCount}
                assignedPeopleCount={assignedPeopleCount}
                unassignedCurrentCount={unassignedCurrentCount}
              />

              {/* Search and Create Row */}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 w-full pl-9 sm:h-9"
                    aria-label="Search projects"
                  />
                </div>
                <Button
                  onClick={() => setIsCreating(true)}
                  className="h-11 w-full sm:h-9 sm:w-auto shrink-0"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">New Project</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </div>

              {/* Create Project Form */}
              {isCreating && (
                <Card className="project-mobile-panel mt-4">
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

              {/* Filters row */}
              <div className="flex flex-col gap-3 mt-4 sm:flex-row sm:items-center">
                {/* Status filter tabs */}
                <div className="-mx-3 overflow-x-auto px-3 scrollbar-hidden sm:mx-0 sm:px-0">
                  <div className="inline-flex min-w-max items-center gap-1 bg-muted/50 p-0.5 rounded-lg border border-border/50">
                    {([
                      { value: 'all' as StatusFilter, label: 'All', count: projects.length },
                      { value: 'maintenance' as StatusFilter, label: 'Maintenance', count: maintenanceCount },
                      { value: 'active' as StatusFilter, label: 'Active', count: activeCount },
                      { value: 'closed' as StatusFilter, label: 'Closed', count: closedCount },
                      { value: 'paid' as StatusFilter, label: 'Paid', count: paidCount },
                    ]).map(({ value, label, count }) => (
                      <button
                        key={value}
                        onClick={() => setStatusFilter(value)}
                        className={cn(
                          "min-h-10 px-3 py-2 text-xs font-medium rounded-md transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.98] sm:min-h-0 sm:py-1.5",
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
                </div>

                {/* Tag filter chips */}
                <div className="-mx-3 overflow-x-auto px-3 scrollbar-hidden sm:mx-0 sm:flex-1 sm:px-0">
                  <div className="flex min-w-max items-center gap-1.5 sm:min-w-0 sm:flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    {ALL_TAGS.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "min-h-9 px-2.5 py-1 text-[10px] font-medium rounded-full border transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98] sm:min-h-0 sm:px-2 sm:py-0.5",
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
                        className="min-h-9 px-2 text-[10px] text-muted-foreground/60 hover:text-foreground underline underline-offset-2 sm:min-h-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Badges */}
              <div className="grid grid-cols-2 gap-2 mt-3 sm:flex sm:items-center sm:gap-3">
                <Badge variant="outline" className="justify-start text-sm py-2 px-3 sm:py-1">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {filteredProjects.length} {filteredProjects.length === 1 ? 'Project' : 'Projects'}
                </Badge>
                <Badge variant="outline" className="justify-start text-sm py-2 px-3 sm:py-1">
                  <LinkIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {totalManualLinks} Links
                </Badge>
              </div>
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

interface OperationsPulsePanelProps {
  filteredCount: number;
  currentCount: number;
  runningScanCount: number;
  connectedSystemCount: number;
  assignedPeopleCount: number;
  unassignedCurrentCount: number;
}

function OperationsPulsePanel({
  filteredCount,
  currentCount,
  runningScanCount,
  connectedSystemCount,
  assignedPeopleCount,
  unassignedCurrentCount,
}: OperationsPulsePanelProps) {
  return (
    <section className="project-ops-panel relative overflow-hidden rounded-lg border bg-card/80 p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" />
            Operations desk
            <Badge variant="outline" className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-300">
              Live
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {filteredCount} visible, {currentCount} in motion, {unassignedCurrentCount} need crew.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
          <OpsMetric
            icon={<Clock3 className="h-3.5 w-3.5" />}
            label="Work queue"
            value={String(currentCount)}
            tone="emerald"
          />
          <OpsMetric
            icon={<RadioTower className="h-3.5 w-3.5" />}
            label="Scans"
            value={runningScanCount > 0 ? String(runningScanCount) : 'Ready'}
            tone={runningScanCount > 0 ? 'cyan' : 'muted'}
            live={runningScanCount > 0}
          />
          <OpsMetric
            icon={<UserCheck className="h-3.5 w-3.5" />}
            label="People"
            value={assignedPeopleCount > 0 ? String(assignedPeopleCount) : 'Open'}
            tone="amber"
          />
          <OpsMetric
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Systems"
            value={String(connectedSystemCount)}
            tone="violet"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden="true">
        {['Build', 'QA', 'Review', 'Ship'].map((step, index) => (
          <div key={step} className="work-activity-step rounded-full border bg-background/80 px-2 py-1">
            <div className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', index === 0 ? 'bg-emerald-500' : index === 1 ? 'bg-cyan-500' : index === 2 ? 'bg-amber-500' : 'bg-violet-500')} />
              <span className="truncate text-[10px] font-medium text-muted-foreground">{step}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpsMetric({
  icon,
  label,
  value,
  tone,
  live = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'emerald' | 'cyan' | 'amber' | 'violet' | 'muted';
  live?: boolean;
}) {
  const toneClass = {
    emerald: 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    cyan: 'text-cyan-600 dark:text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    amber: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20',
    violet: 'text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/20',
    muted: 'text-muted-foreground bg-muted/40 border-border/60',
  }[tone];

  return (
    <div className="rounded-md border bg-background/75 p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <span className={cn('rounded-full border p-1', toneClass)}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {live && <span className="work-live-dot h-1.5 w-1.5 rounded-full bg-cyan-500" aria-hidden="true" />}
        <span className="truncate text-sm font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}
