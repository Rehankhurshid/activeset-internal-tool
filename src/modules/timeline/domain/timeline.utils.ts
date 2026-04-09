import {
    addDays,
    differenceInCalendarDays,
    eachDayOfInterval,
    eachMonthOfInterval,
    eachWeekOfInterval,
    format,
    parseISO,
    startOfMonth,
    startOfWeek,
    startOfQuarter,
    startOfYear,
    endOfMonth,
    endOfQuarter,
    endOfYear,
    isValid,
} from 'date-fns';
import type { TimelineMilestone } from '@/types';

export function parseDate(iso: string): Date {
    const d = parseISO(iso);
    return isValid(d) ? d : new Date();
}

export function toISO(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

export function daysBetween(startISO: string, endISO: string): number {
    return differenceInCalendarDays(parseDate(endISO), parseDate(startISO));
}

export function shiftISO(iso: string, days: number): string {
    return toISO(addDays(parseDate(iso), days));
}

/**
 * Derive the visible range of the timeline based on the milestones,
 * padded by a buffer so bars don't sit on the edges.
 */
export function computeVisibleRange(
    milestones: TimelineMilestone[],
    bufferDays = 7
): { start: string; end: string } {
    if (milestones.length === 0) {
        const today = new Date();
        return {
            start: toISO(addDays(today, -bufferDays * 2)),
            end: toISO(addDays(today, bufferDays * 4)),
        };
    }
    let minDate = parseDate(milestones[0].startDate);
    let maxDate = parseDate(milestones[0].endDate);
    for (const m of milestones) {
        const s = parseDate(m.startDate);
        const e = parseDate(m.endDate);
        if (s < minDate) minDate = s;
        if (e > maxDate) maxDate = e;
    }
    return {
        start: toISO(addDays(minDate, -bufferDays)),
        end: toISO(addDays(maxDate, bufferDays)),
    };
}

export function totalDays(startISO: string, endISO: string): number {
    return daysBetween(startISO, endISO) + 1;
}

// --- Ruler cell builders ---

export interface RulerCell {
    label: string;
    subLabel?: string;
    leftDays: number;  // days from rangeStart
    widthDays: number;
    isWeekend?: boolean;
}

export function buildWeekCells(startISO: string, endISO: string): RulerCell[] {
    const start = parseDate(startISO);
    const end = parseDate(endISO);
    const days = eachDayOfInterval({ start, end });
    return days.map((d) => ({
        label: format(d, 'EEE').charAt(0),
        subLabel: format(d, 'd'),
        leftDays: differenceInCalendarDays(d, start),
        widthDays: 1,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
    }));
}

export function buildWeekGroupCells(startISO: string, endISO: string): RulerCell[] {
    const start = parseDate(startISO);
    const end = parseDate(endISO);
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
    return weeks.map((w) => {
        const left = Math.max(differenceInCalendarDays(w, start), 0);
        const weekEnd = addDays(w, 6);
        const clampedEnd = weekEnd > end ? end : weekEnd;
        const clampedStart = w < start ? start : w;
        const widthDays = differenceInCalendarDays(clampedEnd, clampedStart) + 1;
        return {
            label: `W${format(w, 'II')}`,
            subLabel: format(w, 'MMM d'),
            leftDays: left,
            widthDays,
        };
    });
}

export function buildMonthCells(startISO: string, endISO: string): RulerCell[] {
    const start = parseDate(startISO);
    const end = parseDate(endISO);
    const months = eachMonthOfInterval({ start, end });
    return months.map((m) => {
        const monthStart = startOfMonth(m);
        const monthEnd = endOfMonth(m);
        const clampedStart = monthStart < start ? start : monthStart;
        const clampedEnd = monthEnd > end ? end : monthEnd;
        return {
            label: format(m, 'MMM'),
            subLabel: format(m, 'yyyy'),
            leftDays: differenceInCalendarDays(clampedStart, start),
            widthDays: differenceInCalendarDays(clampedEnd, clampedStart) + 1,
        };
    });
}

export function buildQuarterCells(startISO: string, endISO: string): RulerCell[] {
    const start = parseDate(startISO);
    const end = parseDate(endISO);
    // Walk quarter starts
    const cells: RulerCell[] = [];
    let cursor = startOfQuarter(start);
    while (cursor <= end) {
        const qEnd = endOfQuarter(cursor);
        const clampedStart = cursor < start ? start : cursor;
        const clampedEnd = qEnd > end ? end : qEnd;
        cells.push({
            label: `Q${Math.floor(cursor.getMonth() / 3) + 1}`,
            subLabel: format(cursor, 'yyyy'),
            leftDays: differenceInCalendarDays(clampedStart, start),
            widthDays: differenceInCalendarDays(clampedEnd, clampedStart) + 1,
        });
        cursor = addDays(endOfQuarter(cursor), 1);
    }
    return cells;
}

export function buildYearCells(startISO: string, endISO: string): RulerCell[] {
    const start = parseDate(startISO);
    const end = parseDate(endISO);
    const cells: RulerCell[] = [];
    let cursor = startOfYear(start);
    while (cursor <= end) {
        const yEnd = endOfYear(cursor);
        const clampedStart = cursor < start ? start : cursor;
        const clampedEnd = yEnd > end ? end : yEnd;
        cells.push({
            label: format(cursor, 'yyyy'),
            leftDays: differenceInCalendarDays(clampedStart, start),
            widthDays: differenceInCalendarDays(clampedEnd, clampedStart) + 1,
        });
        cursor = addDays(endOfYear(cursor), 1);
    }
    return cells;
}

export function formatDateShort(iso: string): string {
    return format(parseDate(iso), 'MMM d');
}

export function formatDateLong(iso: string): string {
    return format(parseDate(iso), 'MMM d, yyyy');
}

export function durationLabel(startISO: string, endISO: string): string {
    const days = totalDays(startISO, endISO);
    if (days <= 7) return `${days}d`;
    const weeks = Math.round(days / 7);
    return `${weeks}w`;
}

export function startOfWeekISO(iso: string): string {
    return toISO(startOfWeek(parseDate(iso), { weekStartsOn: 1 }));
}
