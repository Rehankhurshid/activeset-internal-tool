#!/usr/bin/env tsx
/**
 * The always-on worker.
 *
 *   npm run worker doctor     what this machine can do
 *   npm run worker run        take jobs until stopped
 *   npm run worker once       take one job and exit
 *   npm run worker enqueue image_budget <projectId>
 *
 * It polls Firestore for work, so it needs no inbound connection: put it on a
 * PC behind any router, leave it running, and the app can hand it jobs from
 * anywhere. If the machine is off, jobs wait.
 */

import { Command } from 'commander';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { checkOllama, resolveOllama } from '@/lib/alt-text';
import { findBrowserExecutable } from '@/lib/image-budget/browser';
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  heartbeat,
  reportWorkerAlive,
  type WorkerJob,
  type WorkerJobKind,
} from '@/lib/worker/queue';
import { describeResult, runImageBudget, type ImageBudgetPayload } from '@/lib/worker/handlers/image-budget';
import { runAltTextForProject, type AltTextPayload } from '@/lib/worker/handlers/alt-text';
import { loadProjectDocAdmin } from '@/lib/project-admin';

for (const file of ['.env.local', '.env']) dotenv.config({ path: file, quiet: true });

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (v: string) => (useColour ? `[${code}m${v}[0m` : v);
const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');

const stamp = () => dim(new Date().toLocaleTimeString());
const log = (...parts: string[]) => console.log(stamp(), ...parts);

// ─── hardware ───────────────────────────────────────────────────────────────

interface Hardware {
  platform: string;
  cpu: string;
  cores: number;
  ramGb: number;
  gpu?: string;
  vramGb?: number;
}

/** `nvidia-smi` ships with the driver on every platform, and says everything we need. */
function readHardware(): Hardware {
  const base: Hardware = {
    platform: `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0]?.model.trim() ?? 'unknown',
    cores: os.cpus().length,
    ramGb: Math.round(os.totalmem() / 1024 ** 3),
  };

  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [name, memory] = out.split('\n')[0].split(',').map((v) => v.trim());
    const vram = Number.parseInt(memory, 10);
    return { ...base, gpu: name, vramGb: Number.isFinite(vram) ? Math.round(vram / 1024) : undefined };
  } catch {
    return base;
  }
}

/**
 * Bigger models are meaningfully better at reading text inside an image,
 * which is most of what a marketing site's graphics are. The limit is VRAM:
 * a model that does not fit spills to system memory and runs at a crawl.
 */
function recommendModel(hardware: Hardware): { model: string; why: string } {
  const vram = hardware.vramGb ?? 0;
  if (vram >= 20) {
    return {
      model: 'qwen2.5vl:32b',
      why: `${vram} GB of VRAM fits the 32B model, which is markedly better at reading text in images`,
    };
  }
  if (vram >= 10) {
    return { model: 'qwen2.5vl:7b', why: `${vram} GB of VRAM comfortably fits the 7B model` };
  }
  if (vram > 0) {
    return { model: 'qwen2.5vl:7b', why: `${vram} GB of VRAM — the 7B model fits with room for the browser` };
  }
  return { model: 'qwen2.5vl:7b', why: 'No CUDA GPU found, so this runs on CPU — slower, but fine overnight' };
}

// ─── job handling ───────────────────────────────────────────────────────────

async function handle(job: WorkerJob): Promise<Record<string, unknown>> {
  const progress = async (message: string, fraction?: number) => {
    log(dim(`  ${message}`));
    await heartbeat(job.id, message, fraction).catch(() => undefined);
  };

  if (job.kind === 'alt_text') {
    const result = await runAltTextForProject(job.projectId, job.payload as AltTextPayload, progress);
    log(
      green('  done'),
      `${result.described} described, ${result.decorative} decorative, ${result.needsReview} to review`,
    );
    return result as unknown as Record<string, unknown>;
  }

  if (job.kind === 'image_budget') {
    const project = await loadProjectDocAdmin(job.projectId);
    if (!project) throw new Error(`Project ${job.projectId} not found`);
    const payload = job.payload as ImageBudgetPayload;
    const result = await runImageBudget(
      project,
      { emitDir: payload.emitDir ?? process.env.WORKER_EMIT_DIR, ...payload },
      progress,
    );
    log(green('  done'), describeResult(result));
    return result as unknown as Record<string, unknown>;
  }

  throw new Error(`No handler for job kind "${job.kind}"`);
}

// ─── commands ───────────────────────────────────────────────────────────────

const program = new Command();
program.name('worker').description('Runs alt text and image measurement on this machine').version('1.0.0');

program
  .command('doctor')
  .description('What this machine can do, and what it is missing')
  .action(async () => {
    const hardware = readHardware();
    const { host, model } = resolveOllama();

    console.log(bold('Worker machine'));
    console.log(`  ${hardware.platform}`);
    console.log(`  ${hardware.cpu} · ${hardware.cores} cores · ${hardware.ramGb} GB RAM`);
    console.log(
      hardware.gpu
        ? `  ${green(hardware.gpu)}${hardware.vramGb ? ` · ${hardware.vramGb} GB VRAM` : ''}`
        : `  ${yellow('No CUDA GPU detected')} ${dim('(nvidia-smi not on PATH)')}`,
    );

    const recommendation = recommendModel(hardware);
    console.log();
    console.log(bold('Vision model'));
    console.log(`  configured  ${model}`);
    console.log(`  recommended ${recommendation.model} ${dim(`— ${recommendation.why}`)}`);
    const health = await checkOllama();
    console.log(
      health.ok ? `  ${green('Ollama ready')} ${dim(host)}` : `  ${red(health.problem ?? 'Ollama not ready')}`,
    );
    if (health.models.length) console.log(dim(`  installed: ${health.models.join(', ')}`));

    console.log();
    console.log(bold('Browser'));
    const browser = findBrowserExecutable();
    console.log(browser ? `  ${green(browser)}` : `  ${red('No Chrome or Edge found')}`);

    console.log();
    console.log(bold('Credentials'));
    const { hasFirebaseAdminCredentials } = await import('@/lib/firebase-admin');
    console.log(
      hasFirebaseAdminCredentials
        ? `  ${green('Firebase admin ready')}`
        : `  ${red('No Firebase admin credentials')} ${dim('— npx vercel env pull .env.local')}`,
    );
    console.log(dim(`  emit dir: ${process.env.WORKER_EMIT_DIR ?? path.resolve('optimised-images')}`));

    const ready = health.ok && !!browser && hasFirebaseAdminCredentials;
    console.log();
    console.log(ready ? green('Ready. Start it with:  npm run worker run') : red('Not ready — see above.'));
    if (!ready) process.exitCode = 1;
  });

async function loop(options: { once?: boolean; interval?: string; kinds?: string; id?: string }) {
  const workerId = options.id || process.env.WORKER_ID || os.hostname();
  const intervalMs = Math.max(2000, Number.parseInt(options.interval || '10', 10) * 1000);
  const kinds = options.kinds ? (options.kinds.split(',') as WorkerJobKind[]) : undefined;
  const hardware = readHardware();

  log(bold(`worker ${workerId}`), dim(`polling every ${intervalMs / 1000}s`));
  if (kinds) log(dim(`  only: ${kinds.join(', ')}`));

  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(1);
    stopping = true;
    log(yellow('stopping after this job — press ctrl-c again to force'));
  });

  for (;;) {
    if (stopping) break;

    let job: WorkerJob | null = null;
    try {
      await reportWorkerAlive(workerId, {
        ...hardware,
        model: resolveOllama().model,
        kinds: kinds ?? ['alt_text', 'image_budget'],
      });
      job = await claimNextJob(workerId, kinds);
    } catch (error) {
      log(red('queue unreachable'), dim(error instanceof Error ? error.message : String(error)));
    }

    if (!job) {
      if (options.once) {
        log(dim('nothing queued'));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }

    log(bold(`${job.kind}`), dim(`${job.projectName ?? job.projectId} · ${job.id}`));
    const startedAt = Date.now();
    try {
      const result = await handle(job);
      await completeJob(job.id, { ...result, durationMs: Date.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(red('  failed'), message);
      await failJob(job.id, message).catch(() => undefined);
    }

    if (options.once) return;
  }
}

program
  .command('run')
  .description('Take jobs until stopped')
  .option('-i, --interval <seconds>', 'how often to check for work', '10')
  .option('-k, --kinds <list>', 'only these job kinds, comma separated')
  .option('--id <name>', 'worker name shown in the app (default: hostname)')
  .action((options) => loop(options));

program
  .command('once')
  .description('Take one job and exit — useful from Task Scheduler')
  .option('-k, --kinds <list>', 'only these job kinds, comma separated')
  .option('--id <name>', 'worker name')
  .action((options) => loop({ ...options, once: true }));

program
  .command('enqueue')
  .description('Queue a job by hand')
  .argument('<kind>', 'alt_text or image_budget')
  .argument('<projectId>')
  .option('--pages <n>', 'page limit')
  .option('--emit <dir>', 'where image_budget writes resized files')
  .action(async (kind: string, projectId: string, options: { pages?: string; emit?: string }) => {
    if (kind !== 'alt_text' && kind !== 'image_budget') {
      console.error(red(`Unknown kind "${kind}". Use alt_text or image_budget.`));
      process.exit(1);
    }
    const project = await loadProjectDocAdmin(projectId);
    const job = await enqueueJob({
      kind,
      projectId,
      projectName: project?.name,
      payload: {
        ...(options.pages ? { pageLimit: Number.parseInt(options.pages, 10), limit: Number.parseInt(options.pages, 10) } : {}),
        ...(options.emit ? { emitDir: options.emit } : {}),
      },
      requestedBy: 'cli',
    });
    console.log(green(`Queued ${kind} for ${project?.name ?? projectId}`), dim(job.id));
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
