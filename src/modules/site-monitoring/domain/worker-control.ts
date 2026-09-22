/**
 * What the team is allowed to do to the worker machine, from the app.
 *
 * The machine holds `FIREBASE_SERVICE_ACCOUNT_JSON` — full admin on every
 * project — so "control it from the app" must not become "run things on it
 * from the app". Every operation here is a **named action from a closed
 * list**. There is no command string, no argument that reaches a shell, and
 * the worker ignores any action it does not recognise. Adding a capability
 * means editing this file and the worker together, which is the point: it is
 * reviewable in one place.
 *
 * Pure and client-safe; the app and the worker both read it.
 */

/** Settings the worker converges on. Declarative, so it is idempotent and has no backlog. */
export interface WorkerDesiredState {
  /** Stop claiming new work. A job already running is allowed to finish. */
  paused?: boolean;
  /** Vision model for alt text. Validated against KNOWN_MODELS before it is honoured. */
  model?: string;
  /** Who last changed this, and when. */
  by?: string;
  at?: string;
}

/** One-shot things that cannot be expressed as state. */
export type WorkerAction = 'restart' | 'update' | 'doctor' | 'clear_cache';

export const WORKER_ACTIONS: readonly WorkerAction[] = ['restart', 'update', 'doctor', 'clear_cache'];

export function isWorkerAction(value: unknown): value is WorkerAction {
  return typeof value === 'string' && (WORKER_ACTIONS as readonly string[]).includes(value);
}

export const ACTION_LABEL: Record<WorkerAction, { label: string; detail: string; confirm?: string }> = {
  restart: {
    label: 'Restart',
    detail: 'Exit cleanly so the service manager starts it again. Picks up config changes.',
  },
  update: {
    label: 'Update',
    detail: 'Pull the latest code, reinstall dependencies, then restart.',
    confirm: 'This pulls whatever is on main and restarts the worker. Continue?',
  },
  doctor: {
    label: 'Run checks',
    detail: 'Re-read the hardware, model and credentials, and report back here.',
  },
  clear_cache: {
    label: 'Clear cache',
    detail: 'Forget every cached alt-text judgement so the next run re-reads each image.',
    confirm: 'Cached judgements are re-generated at roughly ten seconds an image. Continue?',
  },
};

/**
 * Models the worker will accept.
 *
 * A closed list rather than free text: `model` is passed to Ollama, and an
 * unvetted string from a form field is the one place this design could turn
 * into "fetch and run arbitrary weights on the machine".
 */
export const KNOWN_MODELS = [
  { id: 'qwen2.5vl:7b', label: 'Qwen2.5-VL 7B', note: 'Good on any machine. ~6 GB.' },
  { id: 'qwen2.5vl:32b', label: 'Qwen2.5-VL 32B', note: 'Best at reading text in images. Needs ~20 GB VRAM.' },
  { id: 'gemma3:4b', label: 'Gemma 3 4B', note: 'Fastest, weakest at text. ~3 GB.' },
  { id: 'llama3.2-vision:11b', label: 'Llama 3.2 Vision 11B', note: 'A second opinion. ~8 GB.' },
] as const;

export function isKnownModel(value: unknown): value is string {
  return typeof value === 'string' && KNOWN_MODELS.some((model) => model.id === value);
}

export type WorkerCommandStatus = 'pending' | 'running' | 'done' | 'failed' | 'rejected';

export interface WorkerCommand {
  id: string;
  action: WorkerAction;
  status: WorkerCommandStatus;
  requestedBy: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** What the worker has to say — the doctor report, what update pulled, an error. */
  output?: string;
}

/**
 * Whether a desired-state change is acceptable, checked on both sides.
 *
 * The app checks so it can explain the refusal; the worker checks because the
 * app is not the only thing that can write to Firestore.
 */
export function validateDesired(desired: Partial<WorkerDesiredState>): {
  ok: boolean;
  reason?: string;
  value: WorkerDesiredState;
} {
  const value: WorkerDesiredState = {};

  if (desired.paused !== undefined) {
    if (typeof desired.paused !== 'boolean') {
      return { ok: false, reason: 'paused must be true or false', value };
    }
    value.paused = desired.paused;
  }

  if (desired.model !== undefined) {
    if (!isKnownModel(desired.model)) {
      return {
        ok: false,
        reason: `"${String(desired.model)}" is not one of the models this worker will run`,
        value,
      };
    }
    value.model = desired.model;
  }

  return { ok: true, value };
}

/** A machine that has not checked in for this long is treated as offline. */
export const WORKER_OFFLINE_AFTER_MS = 90 * 1000;

/** A command nobody has picked up in this long is stale — the worker was probably off. */
export const COMMAND_STALE_AFTER_MS = 10 * 60 * 1000;

export function isStaleCommand(command: Pick<WorkerCommand, 'status' | 'createdAt'>, now = Date.now()): boolean {
  if (command.status !== 'pending') return false;
  const created = new Date(command.createdAt).getTime();
  return Number.isFinite(created) && now - created > COMMAND_STALE_AFTER_MS;
}

export function describeWorkerState(input: {
  online: boolean;
  paused?: boolean;
  busyWith?: string;
}): { label: string; tone: 'green' | 'amber' | 'grey' } {
  if (!input.online) return { label: 'Offline', tone: 'grey' };
  if (input.paused) return { label: 'Paused', tone: 'amber' };
  if (input.busyWith) return { label: input.busyWith, tone: 'green' };
  return { label: 'Idle, waiting for work', tone: 'green' };
}
