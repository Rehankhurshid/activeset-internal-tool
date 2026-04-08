'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';
import type {
    ProjectTimeline,
    TimelineMilestone,
    TimelineColor,
} from '@/types';
import { TIMELINE_STATUS_LABELS } from '@/types';
import {
    TIMELINE_COLOR_BG,
    TIMELINE_COLOR_SOFT,
    TIMELINE_COLOR_TEXT,
    ZOOM_DAY_WIDTH,
    type TimelineZoom,
} from '../../domain/timeline.types';
import {
    computeVisibleRange,
    daysBetween,
    formatDateShort,
    toISO,
    totalDays,
} from '../../domain/timeline.utils';
import { TimelineRuler } from './TimelineRuler';

export interface ClientProjectTimeline {
    projectId: string;
    projectName: string;
    color: TimelineColor;
    timeline: ProjectTimeline | null;
}

interface ClientCombinedGanttProps {
    projects: ClientProjectTimeline[];
    zoom: TimelineZoom;
}

const LABEL_COL_WIDTH = 240; // px — sticky project label column
const ROW_HEIGHT = 38;
const PROJECT_HEADER_HEIGHT = 34;

type ProjectHeaderRow = {
    kind: 'project';
    project: ClientProjectTimeline;
    milestoneCount: number;
};

type MilestoneRow = {
    kind: 'milestone';
    project: ClientProjectTimeline;
    milestone: TimelineMilestone;
};

type EmptyProjectRow = {
    kind: 'empty';
    project: ClientProjectTimeline;
};

type Row = ProjectHeaderRow | MilestoneRow | EmptyProjectRow;

export function ClientCombinedGantt({ projects, zoom }: ClientCombinedGanttProps) {
    const dayWidth = ZOOM_DAY_WIDTH[zoom];

    const allMilestones = useMemo(
        () =>
            projects.flatMap((p) =>
                p.timeline ? p.timeline.milestones : []
            ),
        [projects]
    );

    const range = useMemo(
        () => computeVisibleRange(allMilestones),
        [allMilestones]
    );

    const totalDayCount = totalDays(range.start, range.end);
    const totalWidth = totalDayCount * dayWidth;

    const rows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        for (const project of projects) {
            const milestones = project.timeline
                ? [...project.timeline.milestones].sort(
                      (a, b) => a.order - b.order
                  )
                : [];
            out.push({
                kind: 'project',
                project,
                milestoneCount: milestones.length,
            });
            if (milestones.length === 0) {
                out.push({ kind: 'empty', project });
            } else {
                for (const m of milestones) {
                    out.push({ kind: 'milestone', project, milestone: m });
                }
            }
        }
        return out;
    }, [projects]);

    const todayDaysFromStart = useMemo(() => {
        const today = toISO(new Date());
        const diff = daysBetween(range.start, today);
        if (diff < 0 || diff > totalDayCount) return null;
        return diff;
    }, [range.start, totalDayCount]);

    return (
        <div className="relative rounded-xl border bg-card overflow-hidden">
            <div className="overflow-auto max-h-[75vh]">
                <div
                    className="relative flex"
                    style={{ minWidth: LABEL_COL_WIDTH + totalWidth }}
                >
                    {/* Left label column */}
                    <div
                        className="sticky left-0 z-30 bg-card border-r border-border/60 shrink-0"
                        style={{ width: LABEL_COL_WIDTH }}
                    >
                        <div className="h-[60px] border-b border-border/60 bg-background sticky top-0 z-20 flex items-end px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Project
                        </div>
                        {rows.map((row) => {
                            if (row.kind === 'project') {
                                return (
                                    <div
                                        key={`label-project-${row.project.projectId}`}
                                        className={cn(
                                            'flex items-center gap-2 px-3 border-b border-border/40 bg-muted/40'
                                        )}
                                        style={{ height: PROJECT_HEADER_HEIGHT }}
                                    >
                                        <span
                                            className={cn(
                                                'h-2.5 w-2.5 rounded-full shrink-0',
                                                TIMELINE_COLOR_BG[row.project.color] ?? 'bg-blue-500'
                                            )}
                                            aria-hidden="true"
                                        />
                                        <Link
                                            href={`/modules/project-links/${row.project.projectId}`}
                                            className={cn(
                                                'text-[11px] font-semibold uppercase tracking-wide truncate hover:underline',
                                                TIMELINE_COLOR_TEXT[row.project.color] ?? ''
                                            )}
                                            title={`Open ${row.project.projectName}`}
                                        >
                                            {row.project.projectName}
                                        </Link>
                                        <ExternalLink
                                            className="h-3 w-3 opacity-40 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="ml-auto text-[10px] font-mono opacity-60">
                                            {row.milestoneCount}
                                        </span>
                                    </div>
                                );
                            }
                            if (row.kind === 'empty') {
                                return (
                                    <div
                                        key={`label-empty-${row.project.projectId}`}
                                        className="flex items-center px-3 border-b border-border/30 text-[11px] italic text-muted-foreground/60"
                                        style={{ height: ROW_HEIGHT }}
                                    >
                                        No milestones
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={`label-${row.project.projectId}-${row.milestone.id}`}
                                    className="flex items-center px-3 border-b border-border/30 text-xs truncate"
                                    style={{ height: ROW_HEIGHT }}
                                    title={row.milestone.title}
                                >
                                    <span className="truncate">{row.milestone.title}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Right scrolling Gantt area */}
                    <div className="relative" style={{ width: totalWidth }}>
                        <TimelineRuler
                            rangeStart={range.start}
                            rangeEnd={range.end}
                            zoom={zoom}
                            dayWidth={dayWidth}
                            totalWidth={totalWidth}
                        />

                        {todayDaysFromStart !== null && (
                            <div
                                className="absolute top-0 bottom-0 w-px bg-rose-500/70 z-10 pointer-events-none"
                                style={{ left: todayDaysFromStart * dayWidth }}
                            >
                                <div className="absolute -top-0.5 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500" />
                            </div>
                        )}

                        {rows.map((row) => {
                            if (row.kind === 'project') {
                                return (
                                    <div
                                        key={`row-project-${row.project.projectId}`}
                                        className="relative border-b border-border/40 bg-muted/20"
                                        style={{
                                            height: PROJECT_HEADER_HEIGHT,
                                            width: totalWidth,
                                        }}
                                    />
                                );
                            }
                            if (row.kind === 'empty') {
                                return (
                                    <div
                                        key={`row-empty-${row.project.projectId}`}
                                        className="relative border-b border-border/30"
                                        style={{ height: ROW_HEIGHT, width: totalWidth }}
                                    />
                                );
                            }
                            return (
                                <div
                                    key={`row-${row.project.projectId}-${row.milestone.id}`}
                                    className="relative border-b border-border/30"
                                    style={{ height: ROW_HEIGHT, width: totalWidth }}
                                >
                                    <ReadOnlyBar
                                        milestone={row.milestone}
                                        rangeStart={range.start}
                                        dayWidth={dayWidth}
                                        color={row.project.color}
                                        projectName={row.project.projectName}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReadOnlyBar({
    milestone,
    rangeStart,
    dayWidth,
    color,
    projectName,
}: {
    milestone: TimelineMilestone;
    rangeStart: string;
    dayWidth: number;
    color: TimelineColor;
    projectName: string;
}) {
    const leftDays = daysBetween(rangeStart, milestone.startDate);
    const durationDays = daysBetween(milestone.startDate, milestone.endDate) + 1;
    const left = leftDays * dayWidth;
    const width = Math.max(durationDays * dayWidth, 16);

    const bgSoft = TIMELINE_COLOR_SOFT[color] ?? TIMELINE_COLOR_SOFT.blue;

    return (
        <div
            className={cn(
                'absolute top-1/2 -translate-y-1/2 h-7 rounded-md border flex items-center overflow-hidden',
                bgSoft,
                milestone.status === 'completed' && 'opacity-70',
                milestone.status === 'blocked' && 'ring-2 ring-destructive/50'
            )}
            style={{ left, width }}
            title={`${projectName} · ${milestone.title} · ${formatDateShort(milestone.startDate)} → ${formatDateShort(milestone.endDate)} · ${TIMELINE_STATUS_LABELS[milestone.status]}`}
            aria-label={`${projectName}: ${milestone.title}, ${formatDateShort(milestone.startDate)} to ${formatDateShort(milestone.endDate)}, ${TIMELINE_STATUS_LABELS[milestone.status]}`}
        >
            <div className="relative z-10 px-2 text-[11px] font-medium truncate flex items-center gap-1.5 w-full">
                <StatusDot status={milestone.status} />
                <span className="truncate">{milestone.title}</span>
            </div>
        </div>
    );
}

function StatusDot({ status }: { status: TimelineMilestone['status'] }) {
    const className = cn(
        'inline-block h-2 w-2 rounded-full shrink-0',
        status === 'not_started' && 'border border-muted-foreground/60',
        status === 'in_progress' && 'bg-blue-500',
        status === 'completed' && 'bg-emerald-500',
        status === 'blocked' && 'bg-destructive'
    );
    return <span className={className} aria-hidden="true" />;
}
