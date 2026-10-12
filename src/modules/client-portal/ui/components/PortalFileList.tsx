import { ArrowUpRight, Figma, FileText, FolderOpen, Globe, Link2, PlayCircle, Video, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortalFileView } from '../../domain/client-portal.types';
import { hostnameOf } from './portal-format';

/** A recognisable icon for the places files usually live; a plain link otherwise. */
function iconFor(url: string): LucideIcon {
  const host = hostnameOf(url);
  if (host.endsWith('figma.com')) return Figma;
  if (host === 'drive.google.com') return FolderOpen;
  if (host.endsWith('google.com') || host.endsWith('notion.so') || host.endsWith('notion.site')) return FileText;
  if (host.endsWith('loom.com') || host.endsWith('youtube.com') || host.endsWith('vimeo.com')) return Video;
  if (host.endsWith('webflow.io') || host.endsWith('framer.website') || host.endsWith('vercel.app')) return Globe;
  return Link2;
}

interface PortalFileListProps {
  files: (PortalFileView & { icon?: LucideIcon; note?: string; help?: { label: string; url: string } })[];
  /** Tighter rows for a list inside a card rather than a section of its own. */
  compact?: boolean;
  className?: string;
}

/** Files and links the client can open, each in a new tab. */
export function PortalFileList({ files, compact = false, className }: PortalFileListProps) {
  if (files.length === 0) return null;

  return (
    <ul
      className={cn(
        'divide-y divide-border overflow-hidden rounded-xl border border-border bg-card',
        !compact && 'rounded-2xl',
        className,
      )}
    >
      {files.map((file) => {
        const Icon = file.icon ?? iconFor(file.url);
        return (
          // The whole row opens the link (its anchor stretches over the row), so a
          // how-to can sit on it as a second, separate link without nesting anchors.
          <li
            key={file.id}
            className={cn(
              'group relative flex items-center gap-3 transition-colors hover:bg-accent has-[a:focus-visible]:bg-accent',
              compact ? 'px-3 py-2.5' : 'px-4 py-3.5 sm:px-5',
            )}
          >
            <span
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                compact ? 'h-7 w-7' : 'h-9 w-9',
              )}
            >
              <Icon aria-hidden="true" className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            </span>
            <span className="min-w-0 flex-1">
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm font-medium text-foreground after:absolute after:inset-0 focus-visible:outline-none"
              >
                {file.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{file.note ?? hostnameOf(file.url)}</span>
                {file.help && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={file.help.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={file.help.label}
                      className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      <PlayCircle aria-hidden="true" className="h-3 w-3" />
                      Watch how
                      <span className="sr-only">: {file.help.label} (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </span>
            </span>
            <ArrowUpRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            />
          </li>
        );
      })}
    </ul>
  );
}
