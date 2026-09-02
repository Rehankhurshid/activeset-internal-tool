'use client';

import Link from 'next/link';
import { ArrowUpRight, Buildings, ClockCounterClockwise } from '@phosphor-icons/react';
import { useRecentProjects } from '@/lib/recent-projects';
import { cn } from '@/lib/utils';

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

/** Superhuman's "Recent Opens", for projects. Renders nothing until there is history. */
export function RecentProjectsPanel({ className }: { className?: string }) {
  const recent = useRecentProjects();
  if (recent.length === 0) return null;

  return (
    <section className={cn('rounded-xl border border-border/70 bg-card/60', className)} aria-labelledby="recent-heading">
      <header className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
        <ClockCounterClockwise className="size-4 text-muted-foreground" />
        <h2 id="recent-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Recent opens
        </h2>
      </header>
      <ul className="divide-y divide-border/40">
        {recent.map((p) => (
          <li key={p.id}>
            <Link
              href={`/modules/project-links/${p.id}`}
              className="sh-row group h-12 gap-2 px-4 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                {p.client && (
                  <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <Buildings className="size-3" /> {p.client}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(p.at)}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
