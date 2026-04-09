export type {
    ProjectTimeline,
    TimelinePhase,
    TimelineMilestone,
    TimelineItemStatus,
    TimelineColor,
    TimelineTemplate,
} from '@/types';

export type TimelineViewMode = 'timeline' | 'list';

export type TimelineZoom = 'week' | 'month' | 'quarter' | 'year';

export const ZOOM_DAY_WIDTH: Record<TimelineZoom, number> = {
    week: 40,
    month: 20,
    quarter: 8,
    year: 3,
};

export const TIMELINE_COLOR_BG: Record<string, string> = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    violet: 'bg-violet-500',
    slate: 'bg-slate-500',
};

export const TIMELINE_COLOR_SOFT: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500/40',
    emerald: 'bg-emerald-500/20 border-emerald-500/40',
    amber: 'bg-amber-500/20 border-amber-500/40',
    rose: 'bg-rose-500/20 border-rose-500/40',
    violet: 'bg-violet-500/20 border-violet-500/40',
    slate: 'bg-slate-500/20 border-slate-500/40',
};

export const TIMELINE_COLOR_TEXT: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    violet: 'text-violet-600 dark:text-violet-400',
    slate: 'text-slate-600 dark:text-slate-400',
};
