'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
    TimelineItemStatus,
    TimelineMilestone,
    TimelineColor,
} from '@/types';
import { TIMELINE_STATUS_LABELS } from '@/types';
import {
    TIMELINE_COLOR_BG,
    TIMELINE_COLOR_SOFT,
} from '../../domain/timeline.types';
import { daysBetween, formatDateShort, shiftISO } from '../../domain/timeline.utils';
import { StatusPicker } from './StatusPicker';

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface TimelineBarProps {
    milestone: TimelineMilestone;
    rangeStart: string;
    dayWidth: number;
    effectiveColor: TimelineColor;
    onOpen: () => void;
    onUpdateDates: (startDate: string, endDate: string) => void;
    onStatusChange: (status: TimelineItemStatus) => void;
}

export function TimelineBar({
    milestone,
    rangeStart,
    dayWidth,
    effectiveColor,
    onOpen,
    onUpdateDates,
    onStatusChange,
}: TimelineBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        mode: DragMode;
        startClientX: number;
        originalStart: string;
        originalEnd: string;
    } | null>(null);

    // Optimistic, in-flight offsets (in days)
    const [previewShift, setPreviewShift] = useState<{
        startDelta: number;
        endDelta: number;
    }>({ startDelta: 0, endDelta: 0 });

    const previewStart = previewShift.startDelta
        ? shiftISO(milestone.startDate, previewShift.startDelta)
        : milestone.startDate;
    const previewEnd = previewShift.endDelta
        ? shiftISO(milestone.endDate, previewShift.endDelta)
        : milestone.endDate;

    const leftDays = daysBetween(rangeStart, previewStart);
    const durationDays = daysBetween(previewStart, previewEnd) + 1;
    const left = leftDays * dayWidth;
    const width = Math.max(durationDays * dayWidth, 16);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLElement>, mode: DragMode) => {
            e.stopPropagation();
            e.preventDefault();
            try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
                // Ignore — happens for synthetic events
            }
            dragRef.current = {
                mode,
                startClientX: e.clientX,
                originalStart: milestone.startDate,
                originalEnd: milestone.endDate,
            };
        },
        [milestone.startDate, milestone.endDate]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            const drag = dragRef.current;
            if (!drag) return;
            const deltaPx = e.clientX - drag.startClientX;
            const deltaDays = Math.round(deltaPx / dayWidth);
            if (drag.mode === 'move') {
                setPreviewShift({ startDelta: deltaDays, endDelta: deltaDays });
            } else if (drag.mode === 'resize-start') {
                // Don't let start pass end
                const maxDelta = daysBetween(drag.originalStart, drag.originalEnd);
                const clamped = Math.min(deltaDays, maxDelta);
                setPreviewShift({ startDelta: clamped, endDelta: 0 });
            } else {
                // resize-end: don't let end pass start
                const minDelta = -daysBetween(drag.originalStart, drag.originalEnd);
                const clamped = Math.max(deltaDays, minDelta);
                setPreviewShift({ startDelta: 0, endDelta: clamped });
            }
        },
        [dayWidth]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            const drag = dragRef.current;
            if (!drag) return;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
            const deltaPx = e.clientX - drag.startClientX;
            const deltaDays = Math.round(deltaPx / dayWidth);
            dragRef.current = null;

            // No movement — treat as click
            if (Math.abs(deltaPx) < 3) {
                setPreviewShift({ startDelta: 0, endDelta: 0 });
                onOpen();
                return;
            }

            if (deltaDays === 0) {
                setPreviewShift({ startDelta: 0, endDelta: 0 });
                return;
            }

            let newStart = drag.originalStart;
            let newEnd = drag.originalEnd;
            if (drag.mode === 'move') {
                newStart = shiftISO(drag.originalStart, deltaDays);
                newEnd = shiftISO(drag.originalEnd, deltaDays);
            } else if (drag.mode === 'resize-start') {
                const maxDelta = daysBetween(drag.originalStart, drag.originalEnd);
                const clamped = Math.min(deltaDays, maxDelta);
                newStart = shiftISO(drag.originalStart, clamped);
            } else {
                const minDelta = -daysBetween(drag.originalStart, drag.originalEnd);
                const clamped = Math.max(deltaDays, minDelta);
                newEnd = shiftISO(drag.originalEnd, clamped);
            }

            setPreviewShift({ startDelta: 0, endDelta: 0 });
            onUpdateDates(newStart, newEnd);
        },
        [dayWidth, onOpen, onUpdateDates]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const dir = e.key === 'ArrowLeft' ? -1 : 1;
                if (e.shiftKey) {
                    onUpdateDates(
                        shiftISO(milestone.startDate, dir),
                        shiftISO(milestone.endDate, dir)
                    );
                } else {
                    // Just the end
                    onUpdateDates(
                        milestone.startDate,
                        shiftISO(milestone.endDate, dir)
                    );
                }
            }
        },
        [milestone.startDate, milestone.endDate, onOpen, onUpdateDates]
    );

    // Reset preview if milestone identity changes
    useEffect(() => {
        setPreviewShift({ startDelta: 0, endDelta: 0 });
    }, [milestone.id, milestone.startDate, milestone.endDate]);

    const progress = Math.max(0, Math.min(100, milestone.progress ?? 0));
    const bgSoft = TIMELINE_COLOR_SOFT[effectiveColor] ?? TIMELINE_COLOR_SOFT.blue;
    const bgFill = TIMELINE_COLOR_BG[effectiveColor] ?? TIMELINE_COLOR_BG.blue;
    const isDragging = dragRef.current !== null;
    const showPreviewDates =
        previewShift.startDelta !== 0 || previewShift.endDelta !== 0;

    return (
        <div
            ref={barRef}
            role="button"
            tabIndex={0}
            aria-label={`${milestone.title}, ${formatDateShort(previewStart)} to ${formatDateShort(previewEnd)}, ${milestone.status}`}
            className={cn(
                'absolute top-1/2 -translate-y-1/2 h-7 rounded-md border flex items-center select-none group',
                'transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background',
                bgSoft,
                isDragging && 'shadow-lg ring-2 ring-primary/60',
                milestone.status === 'completed' && 'opacity-70',
                milestone.status === 'blocked' && 'ring-2 ring-destructive/50'
            )}
            style={{ left, width }}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            title={`${milestone.title} · ${formatDateShort(previewStart)} → ${formatDateShort(previewEnd)}`}
        >
            {/* Progress fill */}
            {progress > 0 && (
                <div
                    className={cn('absolute inset-y-0 left-0 rounded-l-md opacity-40', bgFill)}
                    style={{ width: `${progress}%` }}
                />
            )}

            {/* Resize handles */}
            <div
                role="separator"
                aria-label="Resize start"
                className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-foreground/40 rounded-l"
                onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            />
            <div
                role="separator"
                aria-label="Resize end"
                className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-foreground/40 rounded-r"
                onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            />

            {/* Label */}
            <div className="relative z-10 px-2 text-[11px] font-medium truncate flex items-center gap-1.5 w-full">
                <StatusPicker
                    status={milestone.status}
                    onChange={onStatusChange}
                    align="start"
                >
                    <button
                        type="button"
                        // Keep the status picker independent of drag and
                        // open-on-click: stop pointer and click propagation
                        // before the parent bar's handlers see the event.
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-foreground/10 focus:outline-none focus:ring-1 focus:ring-ring/60"
                        aria-label={`Change status (currently ${TIMELINE_STATUS_LABELS[milestone.status]})`}
                    >
                        <StatusDot status={milestone.status} />
                    </button>
                </StatusPicker>
                <span className="truncate">{milestone.title}</span>
                {showPreviewDates && (
                    <span className="ml-auto shrink-0 text-[10px] opacity-70 tabular-nums">
                        {formatDateShort(previewStart)}–{formatDateShort(previewEnd)}
                    </span>
                )}
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
