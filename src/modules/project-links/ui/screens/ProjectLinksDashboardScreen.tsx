'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
import { ClientUpdatesBanner } from '@/components/projects/ClientUpdatesBanner';
import { isPortalStale, normalizeClientStatus } from '@/modules/client-portal';
import { todayIso } from '@/lib/review-status';
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AppNavigation } from '@/shared/ui';
import { toast } from 'sonner';
import { DashboardToolbar, type StatusFilter } from '@/modules/project-links/ui/components/DashboardToolbar';
import { NewProjectDialog } from '@/modules/project-links/ui/components/NewProjectDialog';
import { useListNavigation, useShortcut } from '@/shared/keyboard';

const MAINTENANCE_TAGS: ProjectTag[] = ['retainer', 'maintenance', 'subscription'];
const ACTIVE_TAGS: ProjectTag[] = ['one_time', 'consulting'];

/** `1`–`7` switch the status filter. One component per option keeps hook order stable. */
function StatusShortcut({
  option,
  index,
  onSelect,
}: {
  option: { value: StatusFilter; label: string };
  index: number;
  onSelect: (value: StatusFilter) => void;
}) {
  useShortcut({
    id: `projects-status-${option.value}`,
    keys: String(index + 1),
    label: index === 0 ? 'Status filter 1–7' : `Filter: ${option.label}`,
    group: 'Projects',
    hidden: index > 0,
    handler: () => onSelect(option.value),
  });
  return null;
}

export function ProjectLinksDashboardScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupByClient, setGroupByClient] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('maintenance');
  const [activeTags, setActiveTags] = useState<ProjectTag[]>([]);
  const router = useRouter();
  // Client names already in use, suggested by the New project dialog so one
  // client's projects group together under one spelling.
  const clientNames = useMemo(
    () =>
      Array.from(new Set(projects.map((p) => p.client?.trim()).filter((c): c is string => Boolean(c)))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [projects],
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  // `?new=1` (the command palette's "New project") opens the New project dialog straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setIsCreating(true);
  }, []);

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

  // Called once the New project dialog has created the project (and its
  // checklist and plan, when chosen).
  const handleProjectCreated = (projectId: string, name: string) => {
    // A new project may have no tags, so the default 'maintenance' filter
    // would hide it. Switch to 'all' and clear tag chips so the user actually
    // sees the project they just created.
    setStatusFilter('all');
    setActiveTags([]);
    toast.success(`Project "${name}" created`, {
      action: {
        label: 'Open',
        onClick: () => router.push(`/modules/project-links/${projectId}?tab=client`),
      },
    });
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
      if (statusFilter === 'needs_client') {
        // Client-facing bucket: portal on and the client owes us something.
        if (project.clientPortal?.enabled !== true) return false;
        if (normalizeClientStatus(project.clientFacing?.status) !== 'needs_client') return false;
      } else if (statusFilter !== 'all') {
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

  // Group by client (stable alphabetical, unassigned last), with a per-group
  // client-portal rollup for the section header.
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
    const today = todayIso();
    const withRollup = (client: string | null, projects: Project[]) => {
      let waitingCount = 0;
      let staleCount = 0;
      for (const p of projects) {
        if (p.clientPortal?.enabled === true && normalizeClientStatus(p.clientFacing?.status) === 'needs_client') waitingCount++;
        if (isPortalStale(p, today)) staleCount++;
      }
      return { client, projects, waitingCount, staleCount };
    };
    const sortedGroups: Array<{ client: string | null; projects: Project[]; waitingCount: number; staleCount: number }> =
      Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([client, projects]) => withRollup(client, projects));
    if (unassigned.length > 0) {
      sortedGroups.push(withRollup(null, unassigned));
    }
    return sortedGroups;
  }, [filteredProjects]);

  // Keyboard cursor runs over the cards in the order they are painted.
  const navProjects = useMemo(
    () => (groupByClient ? groupedProjects.flatMap((g) => g.projects) : filteredProjects),
    [groupByClient, groupedProjects, filteredProjects],
  );
  // The dashboard's single keys pause while the New project dialog is open:
  // otherwise Enter on its Create button would open whichever card was last
  // hovered, and "c" or "v" would rearrange the page behind it.
  const dashboardKeys = !isCreating;
  const { index: focusedIndex, itemProps } = useListNavigation({
    count: navProjects.length,
    onSelect: (i) => {
      const p = navProjects[i];
      if (p) router.push(`/modules/project-links/${p.id}`);
    },
    enabled: dashboardKeys,
    group: 'Projects',
    selectLabel: 'Open project',
    hint: true,
  });
  useShortcut({ id: 'projects-new', keys: 'n', label: 'New project', group: 'Projects', hint: true, enabled: dashboardKeys, handler: () => setIsCreating(true) });
  useShortcut({ id: 'projects-search', keys: '/', label: 'Search projects', group: 'Projects', enabled: dashboardKeys, handler: () => searchInputRef.current?.focus() });
  useShortcut({ id: 'projects-view', keys: 'v', label: 'Toggle grid / list', group: 'Projects', enabled: dashboardKeys, handler: () => setViewMode((m) => (m === 'grid' ? 'list' : 'grid')) });
  useShortcut({ id: 'projects-group', keys: 'c', label: 'Group by client', group: 'Projects', enabled: dashboardKeys, handler: () => setGroupByClient((g) => !g) });

  const renderCard = (project: Project) => {
    const i = navProjects.indexOf(project);
    return (
      <div
        key={project.id}
        {...itemProps(i)}
        className={cn('rounded-lg transition-shadow duration-100', i === focusedIndex && 'sh-nav-focus')}
      >
        <ProjectCard project={project} onDelete={handleDeleteProject} />
      </div>
    );
  };

  // Counts — single pass over projects, recomputed only when projects change.
  const {
    maintenanceCount, activeCount, pausedCount, closedCount, paidCount,
    currentCount, runningScanCount, connectedSystemCount, unassignedCurrentCount,
    sharedCount, needsClientCount, staleCount,
  } = useMemo(() => {
    const c = {
      maintenanceCount: 0, activeCount: 0, pausedCount: 0, closedCount: 0, paidCount: 0,
      currentCount: 0, runningScanCount: 0, connectedSystemCount: 0, unassignedCurrentCount: 0,
      sharedCount: 0, needsClientCount: 0, staleCount: 0,
    };
    const today = todayIso();
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
      if (p.clientPortal?.enabled === true) {
        c.sharedCount++;
        if (normalizeClientStatus(p.clientFacing?.status) === 'needs_client') c.needsClientCount++;
        if (isPortalStale(p, today)) c.staleCount++;
      }
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
    // Last on purpose: keeps `1`–`6` stable and gives this one `7`.
    { value: 'needs_client', label: 'Waiting on client', count: needsClientCount },
  ];

  // Render the nav + header/grid skeleton immediately while projects load,
  // instead of blanking the page on a centered spinner.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <AppNavigation title="Client Projects" showBackButton backHref="/" />
        <main className="flex-1">
          <div className="container mx-auto px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="mb-4 sm:mb-6 space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-12 w-full mb-4 sm:mb-6" />
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </main>
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
                    {` · ${sharedCount} shared`}
                    {needsClientCount > 0 ? ` · ${needsClientCount} waiting on client` : ''}
                    {staleCount > 0 ? ` · ${staleCount} stale` : ''}
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

              {statusOptions.map((option, i) => (
                <StatusShortcut key={option.value} option={option} index={i} onSelect={setStatusFilter} />
              ))}
              <DashboardToolbar
                searchInputRef={searchInputRef}
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

              <NewProjectDialog
                open={isCreating}
                onOpenChange={setIsCreating}
                userId={user?.uid ?? ''}
                userEmail={user?.email ?? ''}
                clients={clientNames}
                onCreated={handleProjectCreated}
              />
            </div>

            {/* Daily review banner — only renders when there are current projects */}
            <DailyReviewBanner projects={projects} className="mb-4 sm:mb-6" />

            {/* Client portal nudge — only renders when a shared portal has gone stale */}
            <ClientUpdatesBanner projects={projects} className="mb-4 sm:mb-6" />

            {/* Projects Grid/List */}
            {filteredProjects.length > 0 ? (
              groupByClient ? (
                <div className="space-y-8">
                  {groupedProjects.map(({ client, projects: clientProjects, waitingCount, staleCount: groupStaleCount }) => (
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
                          {(waitingCount > 0 || groupStaleCount > 0) && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {[
                                waitingCount > 0 ? `${waitingCount} waiting` : null,
                                groupStaleCount > 0 ? `${groupStaleCount} stale` : null,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          )}
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
                          ? "grid grid-cols-1 gap-3 sm:gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-3"
                          : "space-y-3 sm:space-y-4"
                      )}>
                        {clientProjects.map(renderCard)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={cn(
                  viewMode === 'grid'
                    ? "grid grid-cols-1 gap-3 sm:gap-4 md:gap-6 md:grid-cols-2 xl:grid-cols-3"
                    : "space-y-3 sm:space-y-4"
                )}>
                  {filteredProjects.map(renderCard)}
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
