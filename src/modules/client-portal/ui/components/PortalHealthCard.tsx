'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalWarning } from '../../domain/portal-health';

interface PortalHealthCardProps {
  warnings: PortalWarning[];
}

/**
 * Team-only warnings about the client's page (ACT-92): it has gone stale, a
 * field the client expects is empty, or nobody chose who the client talks to.
 * Nothing here reaches the client.
 */
export function PortalHealthCard({ warnings }: PortalHealthCardProps) {
  if (warnings.length === 0) return null;
  const urgent = warnings.some((w) => w.level === 'warn');
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-4 py-3',
        urgent ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-muted/40',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Check the client&apos;s page · only the team sees this
      </p>
      <ul className="mt-2 space-y-2">
        {warnings.map((w) => (
          <li key={w.id} className="flex gap-2">
            {w.level === 'warn' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{w.title}</p>
              <p className="text-xs text-muted-foreground">{w.fix}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
