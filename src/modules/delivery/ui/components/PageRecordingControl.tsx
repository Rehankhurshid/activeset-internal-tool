'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Copy, ExternalLink, Loader2, Play, RotateCcw, Video } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  isRecordingBusy,
  RECORDING_SOURCE_LABEL,
  type PageRecording,
  type RecordingSource,
  type RecordingTargets,
} from '../../domain/delivery.recording';

const ICON_BUTTON =
  'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

function hostAndPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function busyLabel(recording: PageRecording): string {
  if (recording.status === 'queued') return 'Waiting for the worker machine';
  const percent = Math.round((recording.progress ?? 0) * 100);
  return `Recording ${RECORDING_SOURCE_LABEL[recording.source].toLowerCase()} · ${percent}%`;
}

function formatMb(bytes?: number): string | null {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : null;
}

/** Record staging / Record live, as menu items. Disabled sources are left out. */
function SourceItems({
  targets,
  onRecord,
  verb,
}: {
  targets: RecordingTargets;
  onRecord: (source: RecordingSource, url: string) => void;
  verb: string;
}) {
  return (
    <>
      {(['staging', 'live'] as const).map((source) => {
        const url = targets[source];
        if (!url) return null;
        return (
          <DropdownMenuItem key={source} onSelect={() => onRecord(source, url)} className="flex-col items-start gap-0">
            <span className="text-xs">
              {verb} {RECORDING_SOURCE_LABEL[source].toLowerCase()}
            </span>
            <span className="max-w-[240px] truncate font-mono text-[10px] text-muted-foreground">{hostAndPath(url)}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export interface PageRecordingControlProps {
  pageTitle: string;
  recording?: PageRecording;
  targets: RecordingTargets;
  onRecord: (source: RecordingSource, url: string) => Promise<void>;
}

/**
 * The Links column's video button.
 *
 * Nothing yet: a camera that records (asking staging or live when both
 * exist). Queued or recording: a spinner with the progress. Done: a play
 * button that opens the video. Failed: the reason and a retry.
 */
export function PageRecordingControl({ pageTitle, recording, targets, onRecord }: PageRecordingControlProps) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const sources = (['staging', 'live'] as const).filter((source) => targets[source]);
  const busy = sending || isRecordingBusy(recording);
  const hasVideo = Boolean(recording?.videoUrl);

  const record = async (source: RecordingSource, url: string) => {
    setSending(true);
    try {
      await onRecord(source, url);
      toast.success(`Recording ${pageTitle} from ${RECORDING_SOURCE_LABEL[source].toLowerCase()}`, {
        description: 'The worker machine makes it; it appears here when it is ready.',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not queue the recording');
    } finally {
      setSending(false);
    }
  };

  let trigger: React.ReactNode;

  if (busy && !hasVideo) {
    trigger = (
      <span className={cn(ICON_BUTTON, 'cursor-default hover:bg-transparent')} title={recording ? busyLabel(recording) : 'Queuing'}>
        <Loader2 className="size-3.5 animate-spin" aria-label={recording ? busyLabel(recording) : 'Queuing'} />
      </span>
    );
  } else if (hasVideo) {
    trigger = (
      <button
        type="button"
        className={cn(ICON_BUTTON, 'text-primary')}
        onClick={() => setOpen(true)}
        title={busy && recording ? busyLabel(recording) : `Play the ${RECORDING_SOURCE_LABEL[recording!.source].toLowerCase()} recording`}
        aria-label={`Play the recording of ${pageTitle}`}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
      </button>
    );
  } else if (sources.length === 0) {
    trigger = (
      <span
        className="flex size-6 items-center justify-center text-muted-foreground/25"
        title="Nothing to record: add a staging link to the page, or a Staging or Live link to the project"
        aria-hidden="true"
      >
        <Video className="size-3.5" />
      </span>
    );
  } else {
    const failed = recording?.status === 'failed';
    const icon = failed ? (
      <AlertCircle className="size-3.5 text-destructive" />
    ) : (
      <Video className="size-3.5" />
    );
    const title = failed ? `Recording failed: ${recording?.error ?? 'unknown error'}` : 'Record a scroll-through video';

    if (sources.length === 1 && !failed) {
      const source = sources[0];
      trigger = (
        <button
          type="button"
          className={ICON_BUTTON}
          title={`${title} of ${hostAndPath(targets[source]!)}`}
          aria-label={`Record ${pageTitle}`}
          onClick={() => void record(source, targets[source]!)}
        >
          {icon}
        </button>
      );
    } else {
      trigger = (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={ICON_BUTTON} title={title} aria-label={`Record ${pageTitle}`}>
              {icon}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {failed && (
              <>
                <DropdownMenuLabel className="text-xs font-normal text-destructive">{recording?.error}</DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <SourceItems targets={targets} onRecord={(s, u) => void record(s, u)} verb={failed ? 'Try again from' : 'Record'} />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }

  return (
    <>
      {trigger}
      {recording?.videoUrl && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[min(1100px,calc(100vw-2rem))] gap-3 p-4 sm:max-w-[min(1100px,calc(100vw-2rem))]">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {pageTitle} · {RECORDING_SOURCE_LABEL[recording.source]}
              </DialogTitle>
              <DialogDescription className="truncate text-xs">
                {[
                  recording.width && recording.height ? `${recording.width}×${recording.height} · 60 fps` : null,
                  recording.durationSec ? `${recording.durationSec} s` : null,
                  formatMb(recording.bytes),
                  recording.recordedAt
                    ? `recorded ${formatDistanceToNow(new Date(recording.recordedAt), { addSuffix: true })}`
                    : null,
                  hostAndPath(recording.sourceUrl),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </DialogDescription>
            </DialogHeader>

            {/* key: a re-record swaps the file, and the element would keep playing the old one. */}
            <video
              key={recording.videoUrl}
              src={recording.videoUrl}
              poster={recording.posterUrl}
              controls
              autoPlay
              muted
              playsInline
              className="aspect-[16/10] w-full rounded-md border bg-black"
            />

            {busy && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {recording.status ? busyLabel(recording) : 'Queuing'} — this one stays until the new one is ready.
              </p>
            )}
            {recording.status === 'failed' && (
              <p className="text-xs text-destructive">The last re-record failed: {recording.error}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                <a href={recording.videoUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open the MP4
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(recording.videoUrl!).then(
                    () => toast.success('Video link copied'),
                    () => toast.error('Could not copy the link'),
                  );
                }}
              >
                <Copy className="size-3.5" />
                Copy link
              </Button>
              {sources.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" disabled={busy}>
                      <RotateCcw className="size-3.5" />
                      Record again
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <SourceItems targets={targets} onRecord={(s, u) => void record(s, u)} verb="Record" />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
