'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Building2,
    CalendarRange,
    FolderOpen,
    GanttChartSquare,
    ListChecks,
} from 'lucide-react';
import { AppNavigation } from '@/shared/ui';
import { useAuth } from '@/modules/auth-access';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import type { Project } from '@/modules/project-links';
import { timelineRepository } from '../../infrastructure/timeline.repository';
import type {
    ProjectTimeline,
    TimelineColor,
    TimelineZoom,
} from '../../domain/timeline.types';
import {
    ClientCombinedGantt,
    type ClientProjectTimeline,
} from '../components/ClientCombinedGantt';

interface ClientTimelineScreenProps {
    client: string;
}

const PROJECT_PALETTE: TimelineColor[] = [
    'blue',
    'emerald',
    'amber',
    'rose',
    'violet',
    'slate',
];

export function ClientTimelineScreen({ client }: ClientTimelineScreenProps) {
    const { user, loading: authLoading, signInWithGoogle } = useAuth();

    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [projectsLoading, setProjectsLoading] = useState(true);
    const [timelinesById, setTimelinesById] = useState<
        Record<string, ProjectTimeline | null>
    >({});
    const [zoom, setZoom] = useState<TimelineZoom>('month');

    // Subscribe to all projects and filter by client
    useEffect(() => {
        if (!user) return;
        setProjectsLoading(true);
        const unsub = projectLinksRepository.subscribeToAllProjects((projects) => {
            setAllProjects(projects);
            setProjectsLoading(false);
        });
        return () => unsub();
    }, [user]);

    const clientProjects = useMemo(
        () =>
            allProjects
                .filter(
                    (p) =>
                        (p.client?.trim().toLowerCase() ?? '') ===
                        client.trim().toLowerCase()
                )
                .sort((a, b) => a.name.localeCompare(b.name)),
        [allProjects, client]
    );

    // Canonical displayed name (preserves original casing from the data)
    const displayClient = useMemo(() => {
        const first = clientProjects[0]?.client?.trim();
        return first && first.length > 0 ? first : client;
    }, [clientProjects, client]);

    // Subscribe to each project's timeline; tear down stale subscriptions
    useEffect(() => {
        if (clientProjects.length === 0) {
            setTimelinesById({});
            return;
        }
        const unsubs: Array<() => void> = [];
        const activeIds = new Set(clientProjects.map((p) => p.id));

        // Drop timelines for projects no longer in this client
        setTimelinesById((prev) => {
            const next: Record<string, ProjectTimeline | null> = {};
            for (const id of Object.keys(prev)) {
                if (activeIds.has(id)) next[id] = prev[id];
            }
            return next;
        });

        for (const project of clientProjects) {
            const unsub = timelineRepository.subscribeToProjectTimeline(
                project.id,
                (t) => {
                    setTimelinesById((prev) => ({ ...prev, [project.id]: t }));
                }
            );
            unsubs.push(unsub);
        }
        return () => {
            for (const u of unsubs) u();
        };
    }, [clientProjects]);

    const combinedProjects = useMemo<ClientProjectTimeline[]>(() => {
        return clientProjects.map((project, index) => ({
            projectId: project.id,
            projectName: project.name,
            color: PROJECT_PALETTE[index % PROJECT_PALETTE.length],
            timeline: timelinesById[project.id] ?? null,
        }));
    }, [clientProjects, timelinesById]);

    const totalMilestones = useMemo(
        () =>
            combinedProjects.reduce(
                (acc, p) => acc + (p.timeline?.milestones.length ?? 0),
                0
            ),
        [combinedProjects]
    );

    const timelinesLoaded =
        clientProjects.length === 0 ||
        clientProjects.every((p) => timelinesById[p.id] !== undefined);

    if (authLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-[200px] w-full" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p>Please sign in to view this client timeline.</p>
                <Button onClick={signInWithGoogle}>Sign In</Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <AppNavigation
                title={displayClient}
                showBackButton
                backHref="/modules/project-links"
            >
                <Badge variant="secondary" className="hidden sm:inline-flex gap-1">
                    <Building2 className="h-3 w-3" />
                    Client Timeline
                </Badge>
            </AppNavigation>

            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                            <span className="truncate">{displayClient}</span>
                        </h1>
                        <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
                            Combined timeline across all projects for this client
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <Badge variant="outline" className="gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                {clientProjects.length}{' '}
                                {clientProjects.length === 1 ? 'Project' : 'Projects'}
                            </Badge>
                            <Badge variant="outline" className="gap-1.5">
                                <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                                {totalMilestones}{' '}
                                {totalMilestones === 1 ? 'Milestone' : 'Milestones'}
                            </Badge>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Select
                            value={zoom}
                            onValueChange={(v) => setZoom(v as TimelineZoom)}
                        >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                                <CalendarRange className="h-3 w-3 mr-1" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="week">Week</SelectItem>
                                <SelectItem value="month">Month</SelectItem>
                                <SelectItem value="quarter">Quarter</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {projectsLoading || !timelinesLoaded ? (
                    <div className="space-y-3">
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : clientProjects.length === 0 ? (
                    <EmptyState client={displayClient} />
                ) : totalMilestones === 0 ? (
                    <div className="rounded-xl border bg-card p-8 text-center">
                        <GanttChartSquare className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                        <h3 className="text-base font-semibold mb-1">No milestones yet</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            None of the {clientProjects.length}{' '}
                            {clientProjects.length === 1 ? 'project' : 'projects'} under{' '}
                            <span className="font-medium">{displayClient}</span> have timeline
                            milestones yet.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {clientProjects.map((p) => (
                                <Button
                                    key={p.id}
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                >
                                    <Link href={`/modules/project-links/${p.id}`}>
                                        Open {p.name}
                                    </Link>
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <ClientCombinedGantt projects={combinedProjects} zoom={zoom} />
                )}
            </main>
        </div>
    );
}

function EmptyState({ client }: { client: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-card">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No projects found</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                There are no projects assigned to{' '}
                <span className="font-medium">{client}</span>. Assign projects to this
                client from the project dashboard to see them here.
            </p>
            <Button asChild variant="outline" size="sm">
                <Link href="/modules/project-links">Back to dashboard</Link>
            </Button>
        </div>
    );
}
