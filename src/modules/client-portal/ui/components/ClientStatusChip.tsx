import { Eye } from 'lucide-react';
import type { Project } from '@/types';
import { CLIENT_STATUS_TONES, TONE_CLASSES } from '@/lib/ui-tones';
import { cn } from '@/lib/utils';
import { CLIENT_STATUS_LABELS, normalizeClientStatus } from '../../domain/client-portal.types';
import { ageLabel, daysSinceClientUpdate } from '../../domain/client-status';

interface ClientStatusChipProps {
  project: Pick<Project, 'clientPortal' | 'clientFacing'>;
  size?: 'sm' | 'md';
  /** Append "· 3d" (days since the team last marked the portal updated). Default true. */
  showAge?: boolean;
  /** Append an eye + open count when the client has opened the portal. Default true. */
  showViews?: boolean;
  className?: string;
}

/**
 * Compact internal chip: client-facing status (internal wording), freshness
 * and open count. Renders nothing unless the portal is enabled, so cards and
 * lists can drop it in unconditionally.
 */
export function ClientStatusChip({
  project,
  size = 'sm',
  showAge = true,
  showViews = true,
  className,
}: ClientStatusChipProps) {
  if (project.clientPortal?.enabled !== true) return null;

  const status = normalizeClientStatus(project.clientFacing?.status);
  const tone = TONE_CLASSES[CLIENT_STATUS_TONES[status]];
  const days = daysSinceClientUpdate(project.clientFacing);
  const views = project.clientFacing?.viewCount ?? 0;
  const title = [
    `Client sees: ${CLIENT_STATUS_LABELS[status]}`,
    days === null ? 'never marked updated' : `updated ${ageLabel(days)}`,
    views > 0 ? `opened ${views}×` : 'not opened yet',
  ].join(' · ');

  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-[18px] px-1.5 text-[10px]' : 'h-6 px-2 text-xs',
        tone,
        className,
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {CLIENT_STATUS_LABELS[status]}
      {showAge && (
        <span className="opacity-80">· {ageLabel(days)}</span>
      )}
      {showViews && views > 0 && (
        <span className="inline-flex items-center gap-0.5 opacity-80">
          <Eye className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden="true" />
          {views}
        </span>
      )}
    </span>
  );
}
