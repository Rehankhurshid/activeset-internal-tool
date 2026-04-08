'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
    ProjectTimeline,
    TimelineItemStatus,
    TimelineMilestone,
    TimelinePhase,
    TimelineColor,
} from '@/types';
import {
    TIMELINE_COLOR_TEXT,
    ZOOM_DAY_WIDTH,
    type TimelineZoom,
} from '../../domain/timeline.types';
import {
    computeVisibleRange,
    daysBetween,
    totalDays,
    toISO,
} from '../../domain/timeline.utils';
import { TimelineBar } from './TimelineBar';
import { TimelineRuler } from './TimelineRuler';

interface TimelineGanttProps {
    timeline: ProjectTimeline;
    zoom: TimelineZoom;
    onOpenMilestone: (milestoneId: string) => void;
    onUpdateMilestoneDates: (
        milestoneId: string,
        startDate: string,
        endDate: string
    ) => void;
    onUpdateMilestoneStatus: (
        milestoneId: string,
        status: TimelineItemStatus
    ) => void;
    onTogglePhaseCollapsed: (phaseId: string) => void;
}

const LABEL_COL_WIDTH = 224; // px — sticky phase/milestone label column
const ROW_HEIGHT = 40;
const PHASE_HEADER_HEIGHT = 32;

interface UngroupedRow {
    kind: 'milestone';
    milestone: TimelineMilestone;
    color: TimelineColor;
}

interface PhaseHeaderRow {
    kind: 'phase';
    phase: TimelinePhase;
    milestoneCount: number;
}

type Row = PhaseHeaderRow | UngroupedRow;

export function TimelineGantt({
    timeline,
    zoom,
    onOpenMilestone,
    onUpdateMilestoneDates,
    onUpdateMilestoneStatus,
    onTogglePhaseCollapsed,
}: TimelineGanttProps) {
    const dayWidth = ZOOM_DAY_WIDTH[zoom];

    const range = useMemo(
        () => computeVisibleRange(timeline.milestones),
        [timeline.milestones]
    );

    const totalDayCount = totalDays(range.start, range.end);
    const totalWidth = totalDayCount * dayWidth;

    // Organize rows: phases (with their milestones) first (by order), then
    // ungrouped milestones at the bottom.
    const rows = useMemo<Row[]>(() => {
        const sortedPhases = [...timeline.phases].sort((a, b) => a.order - b.order);
        const byPhase: Record<string, TimelineMilestone[]> = {};
        const ungrouped: TimelineMilestone[] = [];
        for (const m of [...timeline.milestones].sort((a, b) => a.order - b.order)) {
            if (m.phaseId && sortedPhases.some((p) => p.id === m.phaseId)) {
                (byPhase[m.phaseId] ||= []).push(m);
            } else {
                ungrouped.push(m);
            }
        }
        const out: Row[] = [];
        for (const p of sortedPhases) {
            const items = byPhase[p.id] ?? [];
            out.push({ kind: 'phase', phase: p, milestoneCount: items.length });
            if (!p.collapsed) {
                for (const m of items) {
                    out.push({
                        kind: 'milestone',
                        milestone: m,
                        color: (m.color ?? p.color ?? 'blue') as TimelineColor,
                    });
                }
            }
        }
        // Ungrouped
        if (ungrouped.length > 0) {
            out.push({
                kind: 'phase',
                phase: {
                    id: '__ungrouped__',
                    title: 'Ungrouped',
                    order: 9999,
                    collapsed: false,
                    color: 'slate',
                },
                milestoneCount: ungrouped.length,
            });
            for (const m of ungrouped) {
                out.push({
                    kind: 'milestone',
                    milestone: m,
                    color: (m.color ?? 'slate') as TimelineColor,
                });
            }
        }
        return out;
    }, [timeline.phases, timeline.milestones]);

    const todayDaysFromStart = useMemo(() => {
        const today = toISO(new Date());
        const diff = daysBetween(range.start, today);
        if (diff < 0 || diff > totalDayCount) return null;
        return diff;
    }, [range.start, totalDayCount]);

    return (
        <div className="relative rounded-xl border bg-card overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
                <div className="relative flex" style={{ minWidth: LABEL_COL_WIDTH + totalWidth }}>
                    {/* Left label column */}
                    <div
                        className="sticky left-0 z-30 bg-card border-r border-border/60 shrink-0"
                        style={{ width: LABEL_COL_WIDTH }}
                    >
                        {/* Spacer for ruler */}
                        <div className="h-[60px] border-b border-border/60 bg-background sticky top-0 z-20 flex items-end px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            Milestone
                        </div>
                        {rows.map((row, i) => {
                            if (row.kind === 'phase') {
                                const isUngrouped = row.phase.id === '__ungrouped__';
                                return (
                                    <div
                                        key={`label-${i}`}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 border-b border-border/40 bg-muted/40',
                                            TIMELINE_COLOR_TEXT[row.phase.color ?? 'slate']
                                        )}
                                        style={{ height: PHASE_HEADER_HEIGHT }}
                                    >
                                        {!isUngrouped && (
                                            <button
                                                type="button"
                                                onClick={() => onTogglePhaseCollapsed(row.phase.id)}
                                                className="p-0.5 -ml-1 rounded hover:bg-muted"
                                                aria-label={row.phase.collapsed ? 'Expand phase' : 'Collapse phase'}
                                            >
                                                {row.phase.collapsed ? (
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        )}
                                        <span className="text-[11px] font-semibold uppercase tracking-wide truncate">
                                            {row.phase.title}
                                        </span>
                                        <span className="ml-auto text-[10px] font-mono opacity-60">
                                            {row.milestoneCount}
                                        </span>
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={`label-${row.milestone.id}`}
                                    className="flex items-center px-3 border-b border-border/30 text-xs truncate"
                                    style={{ height: ROW_HEIGHT }}
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

                        {/* Today vertical line */}
                        {todayDaysFromStart !== null && (
                            <div
                                className="absolute top-0 bottom-0 w-px bg-rose-500/70 z-10 pointer-events-none"
                                style={{ left: todayDaysFromStart * dayWidth }}
                            >
                                <div className="absolute -top-0.5 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500" />
                            </div>
                        )}

                        {/* Rows */}
                        {rows.map((row, i) => {
                            if (row.kind === 'phase') {
                                return (
                                    <div
                                        key={`row-${i}`}
                                        className="relative border-b border-border/40 bg-muted/20"
                                        style={{ height: PHASE_HEADER_HEIGHT, width: totalWidth }}
                                    />
                                );
                            }
                            return (
                                <div
                                    key={`row-${row.milestone.id}`}
                                    className="relative border-b border-border/30"
                                    style={{ height: ROW_HEIGHT, width: totalWidth }}
                                >
                                    <TimelineBar
                                        milestone={row.milestone}
                                        rangeStart={range.start}
                                        dayWidth={dayWidth}
                                        effectiveColor={row.color}
                                        onOpen={() => onOpenMilestone(row.milestone.id)}
                                        onUpdateDates={(s, e) =>
                                            onUpdateMilestoneDates(row.milestone.id, s, e)
                                        }
                                        onStatusChange={(s) =>
                                            onUpdateMilestoneStatus(row.milestone.id, s)
                                        }
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
