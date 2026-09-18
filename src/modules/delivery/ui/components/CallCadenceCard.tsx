'use client';

import { useEffect, useState } from 'react';
import { Loader2, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { todayIso, daysBetweenIso } from '@/lib/review-status';
import { cn } from '@/lib/utils';
import type { ProjectDeliveryState } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * How often we talk to the client, and whether we actually have.
 *
 * Projects do not go quiet on purpose; they go quiet because nobody is counting
 * the days since the last call. Setting the cadence is what gives the count
 * something to be late against.
 */

type Cadence = NonNullable<ProjectDeliveryState['callCadence']>;

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'none', label: 'No call' },
];

/** Days we allow between syncs before the line turns amber. `none` never nags. */
const CADENCE_DAYS: Record<Cadence, number | null> = {
  weekly: 7,
  biweekly: 14,
  none: null,
};

/**
 * Whole days between the last sync and today, counted in local days at both
 * ends. `lastSyncCallAt` is a UTC instant, so it is converted to the local
 * calendar date it happened on before the subtraction — slicing the ISO string
 * would compare a UTC date against a local one and be a day out every evening.
 */
export function daysSinceSync(lastSyncCallAt: string | undefined, today: string = todayIso()): number | null {
  if (!lastSyncCallAt) return null;
  const at = new Date(lastSyncCallAt);
  if (!Number.isFinite(at.getTime())) return null;
  return daysBetweenIso(todayIso(at), today);
}

function syncLabel(days: number | null): string {
  if (days === null) return 'No sync call logged yet';
  if (days <= 0) return 'Last sync today';
  if (days === 1) return 'Last sync yesterday';
  return `Last sync ${days} days ago`;
}

/**
 * Overdue means a cadence is set and the gap has passed it. A project with a
 * cadence and no call ever logged counts as overdue too: that is precisely the
 * project worth chasing.
 */
export function isSyncOverdue(cadence: Cadence, days: number | null): boolean {
  const limit = CADENCE_DAYS[cadence];
  if (limit === null) return false;
  if (days === null) return true;
  return days > limit;
}

interface CallCadenceCardProps {
  projectId: string;
  delivery: ProjectDeliveryState | undefined;
}

export function CallCadenceCard({ projectId, delivery }: CallCadenceCardProps) {
  const serverCadence: Cadence = delivery?.callCadence ?? 'none';
  const serverLastSync = delivery?.lastSyncCallAt;

  // Optimistic overrides, dropped as soon as the live project doc catches up.
  const [cadence, setCadence] = useState<Cadence>(serverCadence);
  const [lastSync, setLastSync] = useState<string | undefined>(serverLastSync);
  useEffect(() => setCadence(serverCadence), [serverCadence]);
  useEffect(() => setLastSync(serverLastSync), [serverLastSync]);

  const [savingCadence, setSavingCadence] = useState(false);
  const [logging, setLogging] = useState(false);

  const days = daysSinceSync(lastSync);
  const overdue = isSyncOverdue(cadence, days);

  const handleCadence = async (next: Cadence) => {
    if (next === cadence || savingCadence) return;
    const previous = cadence;
    setCadence(next);
    setSavingCadence(true);
    try {
      await deliveryRepository.updateDeliveryState(projectId, { callCadence: next });
    } catch (error) {
      setCadence(previous);
      toast.error(error instanceof Error ? error.message : 'Failed to save the call cadence');
    } finally {
      setSavingCadence(false);
    }
  };

  const handleLogCall = async () => {
    if (logging) return;
    const previous = lastSync;
    const now = new Date().toISOString();
    setLastSync(now);
    setLogging(true);
    try {
      await deliveryRepository.updateDeliveryState(projectId, { lastSyncCallAt: now });
      toast.success('Sync call logged');
    } catch (error) {
      setLastSync(previous);
      toast.error(error instanceof Error ? error.message : 'Failed to log the sync call');
    } finally {
      setLogging(false);
    }
  };

  return (
    <section className="space-y-2.5 rounded-lg border bg-card p-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">Sync calls</h2>
        <p className="text-xs text-muted-foreground">How often we talk to the client.</p>
      </div>

      <div
        role="radiogroup"
        aria-label="Sync call cadence"
        className="inline-flex rounded-md border bg-muted/40 p-0.5"
      >
        {CADENCES.map((option) => {
          const active = option.value === cadence;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={savingCadence}
              onClick={() => handleCadence(option.value)}
              className={cn(
                'h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors disabled:opacity-60',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            'text-xs',
            overdue ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
          )}
        >
          {syncLabel(days)}
          {overdue && cadence !== 'none' && (
            <span className="ml-1 font-normal">
              — {cadence === 'weekly' ? 'weekly' : 'biweekly'} sync is due.
            </span>
          )}
        </p>

        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={logging}
          onClick={handleLogCall}
        >
          {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
          Log a sync call
        </Button>
      </div>
    </section>
  );
}
