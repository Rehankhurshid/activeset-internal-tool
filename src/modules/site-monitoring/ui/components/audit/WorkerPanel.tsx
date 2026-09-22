'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, Loader2, Pause, Play, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ACTION_LABEL,
  KNOWN_MODELS,
  WORKER_ACTIONS,
  describeWorkerState,
  type WorkerAction,
} from '../../../domain/worker-control';
import type { WorkerDoc, WorkerJobDoc } from '../../../infrastructure/worker.repository';
import { useWorkerControl } from '../../hooks/useWorkerControl';
import { relativeTime } from './relative-time';

/**
 * The worker machine, controllable from wherever you are.
 *
 * The machine polls outbound and never accepts a connection, so this is not
 * remote access — it is a set of named operations it agrees to perform. That
 * is the point: everyone on the team can pause it or switch its model from a
 * phone, and nobody needs a key, a VPN, or shell on a box that holds the
 * database service account.
 */

export interface WorkerPanelProps {
  worker: WorkerDoc;
  online: boolean;
  activeJob?: WorkerJobDoc;
  userEmail: string;
  isReadOnly?: boolean;
}

const TONE = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  grey: 'bg-neutral-400',
};

export function WorkerPanel({ worker, online, activeJob, userEmail, isReadOnly }: WorkerPanelProps) {
  const [open, setOpen] = useState(false);
  const { desired, commands, busy, setPaused, setModel, send } = useWorkerControl(worker.workerId, userEmail);
  const [confirming, setConfirming] = useState<WorkerAction | null>(null);

  const paused = desired.paused ?? worker.paused ?? false;
  const busyWith = activeJob?.status === 'running' ? activeJob.progress || `Running ${activeJob.kind}` : undefined;
  const state = describeWorkerState({ online, paused, busyWith });
  const lastCommand = commands[0];
  const model = desired.model ?? worker.model;

  const act = async (action: WorkerAction) => {
    const needsConfirm = ACTION_LABEL[action].confirm;
    if (needsConfirm && confirming !== action) {
      setConfirming(action);
      return;
    }
    setConfirming(null);
    await send(action);
  };

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm truncate">{worker.workerId}</span>
        <span className={cn('h-2 w-2 rounded-full shrink-0', TONE[state.tone])} aria-hidden />
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{state.label}</span>
        {!online && (
          <span className="text-[11px] text-muted-foreground shrink-0">
            last seen {relativeTime(worker.lastSeenAt)}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t px-3 py-3 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {worker.platform && <span>{worker.platform}</span>}
            {worker.cpu && <span>{worker.cpu}</span>}
            {worker.ramGb ? <span>{worker.ramGb} GB RAM</span> : null}
            {worker.gpu && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <Cpu className="h-3 w-3" />
                {worker.gpu}
                {worker.vramGb ? ` · ${worker.vramGb} GB` : ''}
              </span>
            )}
          </div>

          {!isReadOnly && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={paused ? 'default' : 'outline'}
                  className="h-8"
                  disabled={busy !== null}
                  onClick={() => setPaused(!paused)}
                >
                  {busy === 'paused' ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : paused ? (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Pause className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {paused ? 'Resume' : 'Pause'}
                </Button>

                <Select value={model} onValueChange={setModel} disabled={busy !== null}>
                  <SelectTrigger className="h-8 w-auto min-w-[11rem] text-xs">
                    <SelectValue placeholder="Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWN_MODELS.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        <span className="font-mono text-xs">{entry.label}</span>
                        <span className="text-muted-foreground text-[11px] ml-2">{entry.note}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {WORKER_ACTIONS.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={confirming === action ? 'destructive' : 'ghost'}
                    className="h-7 text-xs"
                    disabled={busy !== null || !online}
                    title={ACTION_LABEL[action].detail}
                    onClick={() => act(action)}
                  >
                    {busy === action && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {confirming === action ? 'Sure?' : ACTION_LABEL[action].label}
                  </Button>
                ))}
                {confirming && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                )}
              </div>

              {confirming && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{ACTION_LABEL[confirming].confirm}</p>
              )}

              {!online && (
                <p className="text-xs text-muted-foreground">
                  It is offline, so actions are disabled. Settings still apply — it picks them up when it starts.
                </p>
              )}
            </>
          )}

          {lastCommand && (
            <div className="rounded border bg-muted/30 px-2.5 py-2 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{ACTION_LABEL[lastCommand.action]?.label ?? lastCommand.action}</span>
                <Badge
                  variant={lastCommand.status === 'failed' || lastCommand.status === 'rejected' ? 'destructive' : 'secondary'}
                  className="h-4 px-1.5 text-[10px]"
                >
                  {lastCommand.status}
                </Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {lastCommand.requestedBy} · {relativeTime(lastCommand.createdAt)}
                </span>
              </div>
              {lastCommand.output && (
                <pre className="text-[11px] whitespace-pre-wrap font-mono text-muted-foreground max-h-40 overflow-y-auto">
                  {lastCommand.output}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
