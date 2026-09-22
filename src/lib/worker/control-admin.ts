import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db as adminDb, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import {
  isWorkerAction,
  validateDesired,
  type WorkerCommand,
  type WorkerDesiredState,
} from '@/modules/site-monitoring/domain/worker-control';

/**
 * The worker's side of remote control.
 *
 * Two shapes, on purpose. Settings are **declarative** — the worker reads the
 * desired state on every poll and converges — so pausing is idempotent, takes
 * effect on the next cycle and leaves no backlog to drain. Actions are a
 * short queue, because "restart" is an event and not a state.
 *
 * Every action is dispatched through a `switch` over a closed union. Nothing
 * here takes a command string from Firestore, and an unrecognised action is
 * rejected and recorded rather than attempted.
 */

const execFileAsync = promisify(execFile);

function workerRef(workerId: string) {
  if (!hasFirebaseAdminCredentials) throw new Error('No Firebase admin credentials');
  return adminDb.collection('workers').doc(workerId);
}

export async function readDesiredState(workerId: string): Promise<WorkerDesiredState> {
  const snapshot = await workerRef(workerId).collection('control').doc('desired').get();
  if (!snapshot.exists) return {};
  // Validated here too: the app is not the only thing that can write to Firestore.
  const { value } = validateDesired(snapshot.data() as Partial<WorkerDesiredState>);
  return value;
}

export async function claimNextCommand(workerId: string): Promise<WorkerCommand | null> {
  const pending = await workerRef(workerId)
    .collection('commands')
    .where('status', '==', 'pending')
    .limit(5)
    .get();
  if (pending.empty) return null;

  const oldest = pending.docs
    .map((doc) => ({ ...(doc.data() as Omit<WorkerCommand, 'id'>), id: doc.id }))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))[0];

  const ref = workerRef(workerId).collection('commands').doc(oldest.id);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const command = { ...(snapshot.data() as Omit<WorkerCommand, 'id'>), id: ref.id };
    if (command.status !== 'pending') return null;

    if (!isWorkerAction(command.action)) {
      transaction.update(ref, {
        status: 'rejected',
        output: `"${String(command.action)}" is not an action this worker knows`,
        finishedAt: new Date().toISOString(),
      });
      return null;
    }

    transaction.update(ref, { status: 'running', startedAt: new Date().toISOString() });
    return { ...command, status: 'running' as const };
  });
}

export async function finishCommand(
  workerId: string,
  commandId: string,
  outcome: { ok: boolean; output: string },
): Promise<void> {
  await workerRef(workerId)
    .collection('commands')
    .doc(commandId)
    .update({
      status: outcome.ok ? 'done' : 'failed',
      output: outcome.output.slice(0, 4000),
      finishedAt: new Date().toISOString(),
    });
}

export interface CommandContext {
  /** Where the repo lives, for `update`. */
  cwd: string;
  /** Re-runs the same checks the `doctor` command prints. */
  doctorReport: () => Promise<string>;
  /** Ask the loop to exit so the service manager restarts us. */
  requestExit: (reason: string) => void;
}

async function run(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    timeout: 10 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
    // Windows resolves `git` and `npm` through .cmd shims, which execFile
    // will not run without a shell. The arguments are constants in this file,
    // never anything that arrived over the network.
    shell: process.platform === 'win32',
  });
  return `${stdout}${stderr}`.trim();
}

/**
 * Do one named thing.
 *
 * `update` deliberately refuses a dirty tree: pulling over someone's
 * half-finished debugging on the box is how you lose an afternoon and
 * a reproduction.
 */
export async function performCommand(command: WorkerCommand, context: CommandContext): Promise<{ ok: boolean; output: string }> {
  switch (command.action) {
    case 'doctor': {
      return { ok: true, output: await context.doctorReport() };
    }

    case 'restart': {
      context.requestExit(`restart requested by ${command.requestedBy}`);
      return { ok: true, output: 'Restarting. The service manager brings it back within a few seconds.' };
    }

    case 'clear_cache': {
      const { clearCache } = await import('@/lib/alt-text/cache');
      const removed = await clearCache();
      return { ok: true, output: `Cleared ${removed} cached judgements.` };
    }

    case 'update': {
      const status = await run('git', ['status', '--porcelain'], context.cwd);
      if (status.trim()) {
        return {
          ok: false,
          output: `The worker's checkout has uncommitted changes, so it was left alone:\n${status}`,
        };
      }
      const pulled = await run('git', ['pull', '--ff-only'], context.cwd);
      const installed = await run('npm', ['install', '--no-audit', '--no-fund'], context.cwd);
      context.requestExit(`update requested by ${command.requestedBy}`);
      return {
        ok: true,
        output: `${pulled}\n\n${installed.split('\n').slice(-5).join('\n')}\n\nRestarting to pick up the new code.`,
      };
    }

    default: {
      // Unreachable while the union and `isWorkerAction` agree; kept so adding
      // an action without a handler is a type error rather than a silent no-op.
      const exhaustive: never = command.action;
      return { ok: false, output: `Unhandled action: ${String(exhaustive)}` };
    }
  }
}
