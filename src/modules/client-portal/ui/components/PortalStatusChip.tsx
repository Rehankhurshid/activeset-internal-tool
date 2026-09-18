import { cn } from '@/lib/utils';
import type { ClientStatus } from '../../domain/client-portal.types';

/** Light-only tones; the portal never renders in dark mode. */
const TONES: Record<ClientStatus, { chip: string; dot: string }> = {
  on_track: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', dot: 'bg-emerald-500' },
  needs_client: { chip: 'bg-amber-50 text-amber-900 ring-amber-600/25', dot: 'bg-amber-500' },
  blocked: { chip: 'bg-rose-50 text-rose-800 ring-rose-600/20', dot: 'bg-rose-500' },
  paused: { chip: 'bg-slate-100 text-slate-700 ring-slate-500/20', dot: 'bg-slate-400' },
  delivered: { chip: 'bg-sky-50 text-sky-800 ring-sky-600/20', dot: 'bg-sky-500' },
};

interface PortalStatusChipProps {
  status: ClientStatus;
  /** Portal wording from the projection (`view.statusLabel`). */
  label: string;
  className?: string;
}

export function PortalStatusChip({ status, label, className }: PortalStatusChipProps) {
  const tone = TONES[status] ?? TONES.on_track;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset',
        tone.chip,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', tone.dot)} />
      {label}
    </span>
  );
}
