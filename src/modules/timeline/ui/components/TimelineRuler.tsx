'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { TimelineZoom } from '../../domain/timeline.types';
import {
    buildMonthCells,
    buildQuarterCells,
    buildWeekCells,
    buildWeekGroupCells,
    buildYearCells,
    type RulerCell,
} from '../../domain/timeline.utils';

interface TimelineRulerProps {
    rangeStart: string;
    rangeEnd: string;
    zoom: TimelineZoom;
    dayWidth: number;
    totalWidth: number;
}

export function TimelineRuler({
    rangeStart,
    rangeEnd,
    zoom,
    dayWidth,
    totalWidth,
}: TimelineRulerProps) {
    const { primary, secondary } = useMemo(() => {
        if (zoom === 'week') {
            return {
                primary: buildWeekGroupCells(rangeStart, rangeEnd),
                secondary: buildWeekCells(rangeStart, rangeEnd),
            };
        }
        if (zoom === 'month') {
            return {
                primary: buildMonthCells(rangeStart, rangeEnd),
                secondary: buildWeekGroupCells(rangeStart, rangeEnd),
            };
        }
        if (zoom === 'quarter') {
            return {
                primary: buildQuarterCells(rangeStart, rangeEnd),
                secondary: buildMonthCells(rangeStart, rangeEnd),
            };
        }
        return {
            primary: buildYearCells(rangeStart, rangeEnd),
            secondary: buildQuarterCells(rangeStart, rangeEnd),
        };
    }, [rangeStart, rangeEnd, zoom]);

    return (
        <div
            className="sticky top-0 z-20 bg-background border-b border-border/60"
            style={{ width: totalWidth }}
        >
            {/* Primary row */}
            <div className="relative h-8 border-b border-border/40">
                {primary.map((cell, i) => (
                    <RulerCellBlock
                        key={`p-${i}`}
                        cell={cell}
                        dayWidth={dayWidth}
                        className="border-r border-border/60 px-2 text-[11px] font-semibold"
                    />
                ))}
            </div>
            {/* Secondary row */}
            <div className="relative h-7">
                {secondary.map((cell, i) => (
                    <RulerCellBlock
                        key={`s-${i}`}
                        cell={cell}
                        dayWidth={dayWidth}
                        className={cn(
                            'border-r border-border/30 px-1 text-[10px] text-muted-foreground',
                            cell.isWeekend && 'bg-muted/40'
                        )}
                        compact={zoom === 'week'}
                    />
                ))}
            </div>
        </div>
    );
}

function RulerCellBlock({
    cell,
    dayWidth,
    className,
    compact = false,
}: {
    cell: RulerCell;
    dayWidth: number;
    className?: string;
    compact?: boolean;
}) {
    return (
        <div
            className={cn('absolute top-0 h-full flex items-center overflow-hidden', className)}
            style={{
                left: cell.leftDays * dayWidth,
                width: cell.widthDays * dayWidth,
            }}
        >
            {compact ? (
                <div className="flex flex-col items-center justify-center w-full leading-none">
                    <span>{cell.label}</span>
                    {cell.subLabel && <span className="text-[9px] opacity-60">{cell.subLabel}</span>}
                </div>
            ) : (
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                    <span>{cell.label}</span>
                    {cell.subLabel && (
                        <span className="text-[9px] opacity-60">{cell.subLabel}</span>
                    )}
                </div>
            )}
        </div>
    );
}
