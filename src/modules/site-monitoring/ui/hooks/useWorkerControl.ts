'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { workerRepository } from '../../infrastructure/worker.repository';
import {
  ACTION_LABEL,
  type WorkerAction,
  type WorkerCommand,
  type WorkerDesiredState,
} from '../../domain/worker-control';

/**
 * Control one worker machine from the app.
 *
 * Settings and actions are deliberately different shapes. Pausing is a
 * setting the machine converges on, so pressing it twice is the same as
 * pressing it once and there is no queue to drain. Restarting is an event,
 * so it is a command with a result you can read afterwards.
 */
export function useWorkerControl(workerId: string | undefined, by: string) {
  const [desired, setDesired] = useState<WorkerDesiredState>({});
  const [commands, setCommands] = useState<WorkerCommand[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!workerId) {
      setDesired({});
      setCommands([]);
      return;
    }
    return workerRepository.subscribeControl(workerId, (state) => {
      setDesired(state.desired);
      setCommands(state.commands);
    });
  }, [workerId]);

  const setPaused = useCallback(
    async (paused: boolean) => {
      if (!workerId) return;
      setBusy('paused');
      try {
        await workerRepository.setDesired(workerId, { paused }, by);
        toast.success(paused ? 'Pausing — it stops after the job it is on' : 'Resumed');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not change that');
      } finally {
        setBusy(null);
      }
    },
    [workerId, by],
  );

  const setModel = useCallback(
    async (model: string) => {
      if (!workerId) return;
      setBusy('model');
      try {
        await workerRepository.setDesired(workerId, { model }, by);
        toast.success(`Model set to ${model} — it takes effect on the next job`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not change the model');
      } finally {
        setBusy(null);
      }
    },
    [workerId, by],
  );

  const send = useCallback(
    async (action: WorkerAction) => {
      if (!workerId) return;
      setBusy(action);
      try {
        await workerRepository.sendCommand(workerId, action, by);
        toast.success(`${ACTION_LABEL[action].label} sent to ${workerId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not send that');
      } finally {
        setBusy(null);
      }
    },
    [workerId, by],
  );

  return { desired, commands, busy, setPaused, setModel, send };
}
