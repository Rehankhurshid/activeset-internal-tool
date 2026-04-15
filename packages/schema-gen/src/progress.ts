/**
 * Progress reporter — posts structured events to the ActiveSet dashboard so a
 * browser tab can render a live terminal while the CLI runs locally.
 *
 * The CLI is the source of truth: stdout logs are unchanged. This is strictly
 * additive and best-effort. A failed POST is swallowed (single warning) so a
 * flaky network never halts analysis.
 */
export type ProgressStep =
  | 'connect'
  | 'fetch'
  | 'scrape'
  | 'analyze'
  | 'write'
  | 'upload'
  | 'done'
  | 'abort';

export type ProgressLevel = 'info' | 'success' | 'warn' | 'error';

export interface ProgressEventInput {
  step: ProgressStep;
  level?: ProgressLevel;
  message: string;
  detail?: string;
  current?: number;
  total?: number;
  durationMs?: number;
}

interface ReporterConfig {
  runId: string;
  secret: string;
  url: string;
}

let config: ReporterConfig | null = null;
let warned = false;
const pending = new Set<Promise<void>>();

export function configureReporter(opts: ReporterConfig | null): void {
  config = opts;
}

export function isReporterActive(): boolean {
  return config !== null;
}

export function emit(event: ProgressEventInput): void {
  if (!config) return;
  const body = JSON.stringify({
    runId: config.runId,
    secret: config.secret,
    event,
  });
  const p = (async () => {
    try {
      const res = await fetch(config!.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok && !warned) {
        warned = true;
        console.warn(
          `  (progress backchannel HTTP ${res.status} — web UI will not update)`
        );
      }
    } catch (err) {
      if (!warned) {
        warned = true;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `  (progress backchannel failed: ${msg} — web UI will not update)`
        );
      }
    }
  })();
  pending.add(p);
  p.finally(() => pending.delete(p));
}

export async function flush(): Promise<void> {
  if (pending.size === 0) return;
  await Promise.allSettled([...pending]);
}
