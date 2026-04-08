'use client';

import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type {
    ProjectTimeline,
    TimelineItemStatus,
    TimelineMilestone,
    TimelineColor,
} from '@/types';
import { TIMELINE_STATUS_LABELS } from '@/types';
import {
    TIMELINE_COLOR_BG,
    TIMELINE_COLOR_TEXT,
} from '../../domain/timeline.types';
import { durationLabel, formatDateShort } from '../../domain/timeline.utils';
import { StatusPicker } from './StatusPicker';

interface TimelineListProps {
    timeline: ProjectTimeline;
    onOpenMilestone: (milestoneId: string) => void;
    onStatusChange: (milestoneId: string, status: TimelineItemStatus) => void;
}

export function TimelineList({
    timeline,
    onOpenMilestone,
    onStatusChange,
}: TimelineListProps) {
    const rows = useMemo(() => {
        const phaseMap = new Map(timeline.phases.map((p) => [p.id, p]));
        return [...timeline.milestones]
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map((m) => {
                const phase = m.phaseId ? phaseMap.get(m.phaseId) : undefined;
                const effectiveColor = (m.color ?? phase?.color ?? 'slate') as TimelineColor;
                return { milestone: m, phase, effectiveColor };
            });
    }, [timeline]);

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Milestone</TableHead>
                        <TableHead>Phase</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Assignee</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(({ milestone, phase, effectiveColor }) => (
                        <TableRow
                            key={milestone.id}
                            className="cursor-pointer"
                            onClick={() => onOpenMilestone(milestone.id)}
                        >
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            'h-2.5 w-2.5 rounded-full shrink-0',
                                            TIMELINE_COLOR_BG[effectiveColor]
                                        )}
                                        aria-hidden="true"
                                    />
                                    <span className="truncate">{milestone.title}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                {phase ? (
                                    <span className={cn('text-xs', TIMELINE_COLOR_TEXT[phase.color ?? 'slate'])}>
                                        {phase.title}
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </TableCell>
                            <TableCell
                                onClick={(e) => {
                                    // Prevent the row click from opening the edit sheet
                                    // when the user is interacting with the status picker.
                                    e.stopPropagation();
                                }}
                            >
                                <StatusPicker
                                    status={milestone.status}
                                    onChange={(next) => onStatusChange(milestone.id, next)}
                                >
                                    <button
                                        type="button"
                                        className="inline-flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-ring/60"
                                        aria-label={`Change status (currently ${TIMELINE_STATUS_LABELS[milestone.status]})`}
                                    >
                                        <StatusBadge status={milestone.status} />
                                    </button>
                                </StatusPicker>
                            </TableCell>
                            <TableCell className="tabular-nums text-xs">
                                {formatDateShort(milestone.startDate)}
                            </TableCell>
                            <TableCell className="tabular-nums text-xs">
                                {formatDateShort(milestone.endDate)}
                            </TableCell>
                            <TableCell className="tabular-nums text-xs">
                                {durationLabel(milestone.startDate, milestone.endDate)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {milestone.assignee || '—'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function StatusBadge({ status }: { status: TimelineMilestone['status'] }) {
    const variant = (() => {
        switch (status) {
            case 'completed':
                return 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400';
            case 'in_progress':
                return 'border-blue-500/40 text-blue-600 dark:text-blue-400';
            case 'blocked':
                return 'border-destructive/40 text-destructive';
            default:
                return 'border-muted-foreground/30 text-muted-foreground';
        }
    })();
    return (
        <Badge
            variant="outline"
            className={cn(
                'text-[10px] font-medium gap-1 pr-1.5 cursor-pointer hover:bg-muted/60 transition-colors',
                variant
            )}
        >
            {TIMELINE_STATUS_LABELS[status]}
            <ChevronDown className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
        </Badge>
    );
}
