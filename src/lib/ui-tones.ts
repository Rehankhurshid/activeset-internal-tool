import type { ProjectStatus, ProjectTag } from '@/types';

/** Shared 5(+1)-tone palette for small stat tiles, metric chips, and status dots. */
export type Tone = 'emerald' | 'cyan' | 'amber' | 'violet' | 'rose' | 'muted';

export const TONE_CLASSES: Record<Tone, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  cyan: 'text-cyan-600 dark:text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  amber: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20',
  violet: 'text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/20',
  rose: 'text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20',
  muted: 'text-muted-foreground bg-muted/40 border-border/60',
};

/** Single source for project tag colors — replaces ProjectCard's TAG_COLORS and the
 *  dashboard's TAG_FILTER_COLORS, which previously duplicated the same palette. */
export const PROJECT_TAG_TONES: Record<ProjectTag, { bg: string; text: string; border: string; hover: string }> = {
  retainer: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', hover: 'hover:bg-blue-500/20' },
  one_time: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', hover: 'hover:bg-amber-500/20' },
  subscription: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', hover: 'hover:bg-purple-500/20' },
  maintenance: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', hover: 'hover:bg-emerald-500/20' },
  consulting: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', hover: 'hover:bg-rose-500/20' },
};

/** Single source for project status colors — replaces ProjectCard's STATUS_BADGE_STYLES. */
export const PROJECT_STATUS_TONES: Record<ProjectStatus, { text: string; border: string; bg: string; dot: string }> = {
  current: { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', dot: 'text-emerald-500' },
  paused: { text: 'text-zinc-400', border: 'border-zinc-500/30', bg: 'bg-zinc-500/5', dot: 'text-zinc-500' },
  closed: { text: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5', dot: 'text-amber-500' },
  paid: { text: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/5', dot: 'text-sky-500' },
};
