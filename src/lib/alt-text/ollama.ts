/**
 * A small Ollama client, built for one job: ask a vision model a question and
 * get back JSON that matches a schema.
 *
 * Structured output is the whole reason this is not a prose prompt. Ollama
 * constrains decoding to the schema, so there is no "sometimes it wraps the
 * answer in backticks" parsing layer, and — because constrained decoding emits
 * keys in schema order — the field order doubles as a reasoning chain.
 */

export const DEFAULT_HOST = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5vl:7b';

export interface OllamaOptions {
  host?: string;
  model?: string;
  /** How long the model stays resident between calls. Reloading a 6 GB model per image is the slowest thing you can do. */
  keepAlive?: string;
  timeoutMs?: number;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

export function resolveOllama(options: OllamaOptions = {}) {
  return {
    host: (options.host || process.env.OLLAMA_HOST || DEFAULT_HOST).replace(/\/$/, ''),
    model: options.model || process.env.OLLAMA_ALT_MODEL || process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    keepAlive: options.keepAlive || '15m',
    timeoutMs: options.timeoutMs ?? 180_000,
  };
}

async function post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface OllamaHealth {
  ok: boolean;
  reachable: boolean;
  version?: string;
  models: string[];
  hasModel: boolean;
  supportsVision: boolean;
  problem?: string;
}

/**
 * Everything that can be wrong before the first image, answered in one go, so
 * the CLI can say "run `ollama pull qwen2.5vl:7b`" instead of failing 200
 * times in a row.
 */
export async function checkOllama(options: OllamaOptions = {}): Promise<OllamaHealth> {
  const { host, model } = resolveOllama(options);
  const base: OllamaHealth = { ok: false, reachable: false, models: [], hasModel: false, supportsVision: false };

  let version: string | undefined;
  try {
    const res = await fetch(`${host}/api/version`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ...base, problem: `Ollama answered ${res.status} at ${host}` };
    version = ((await res.json()) as { version?: string }).version;
  } catch {
    return {
      ...base,
      problem: `Cannot reach Ollama at ${host}. Start it with \`ollama serve\`, or set OLLAMA_HOST.`,
    };
  }

  let models: string[] = [];
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(20_000) });
    const data = (await res.json()) as { models?: { name: string }[] };
    models = (data.models || []).map((m) => m.name);
  } catch {
    return { ...base, reachable: true, version, problem: 'Ollama is running but would not list its models.' };
  }

  const hasModel = models.some((m) => m === model || m.split(':')[0] === model.split(':')[0]);
  if (!hasModel) {
    return {
      ...base,
      reachable: true,
      version,
      models,
      problem: `Model "${model}" is not installed. Run:  ollama pull ${model}`,
    };
  }

  let supportsVision = false;
  try {
    const res = await post(`${host}/api/show`, { model }, 20_000);
    const data = (await res.json()) as { capabilities?: string[] };
    supportsVision = (data.capabilities || []).includes('vision');
  } catch {
    // Older Ollama builds do not report capabilities; assume the caller knows.
    supportsVision = true;
  }

  if (!supportsVision) {
    return {
      ...base,
      reachable: true,
      version,
      models,
      hasModel: true,
      problem: `Model "${model}" cannot see images. Try qwen2.5vl:7b, gemma3:4b or llama3.2-vision:11b.`,
    };
  }

  return { ok: true, reachable: true, version, models, hasModel: true, supportsVision: true };
}

export interface GenerateJsonInput {
  system: string;
  prompt: string;
  /** Base64 image payloads, without the data-URI prefix. */
  images?: string[];
  schema: Record<string, unknown>;
  temperature?: number;
  /** Deterministic sampling when set; vary it to sample independent opinions. */
  seed?: number;
  maxTokens?: number;
}

export interface GenerateJsonResult<T> {
  value: T;
  raw: string;
  /** Nanoseconds the model spent, as Ollama reports it. */
  evalDurationNs?: number;
}

/**
 * One schema-constrained call. Retries once on a transport failure, because a
 * cold model load can outrun a tight socket timeout, and not at all on a bad
 * answer — a model that answered off-schema twice will do it a third time.
 */
export async function generateJson<T>(
  input: GenerateJsonInput,
  options: OllamaOptions = {},
): Promise<GenerateJsonResult<T>> {
  const { host, model, keepAlive, timeoutMs } = resolveOllama(options);

  const body = {
    model,
    system: input.system,
    prompt: input.prompt,
    images: input.images,
    format: input.schema,
    stream: false,
    keep_alive: keepAlive,
    options: {
      temperature: input.temperature ?? 0.1,
      num_predict: input.maxTokens ?? 600,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await post(`${host}/api/generate`, body, timeoutMs);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new OllamaError(`Ollama returned ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as { response?: string; eval_duration?: number; error?: string };
      if (data.error) throw new OllamaError(data.error);
      const raw = (data.response || '').trim();
      if (!raw) throw new OllamaError('Ollama returned an empty response');
      try {
        return { value: JSON.parse(raw) as T, raw, evalDurationNs: data.eval_duration };
      } catch (error) {
        throw new OllamaError(`Ollama returned JSON that would not parse: ${raw.slice(0, 200)}`, error);
      }
    } catch (error) {
      lastError = error;
      const transport = !(error instanceof OllamaError);
      if (!transport || attempt === 1) break;
    }
  }

  if (lastError instanceof OllamaError) throw lastError;
  throw new OllamaError(
    `Could not reach Ollama at ${host}. Is \`ollama serve\` running?`,
    lastError,
  );
}
