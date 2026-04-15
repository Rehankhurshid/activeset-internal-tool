/**
 * Terminal UI helpers — ANSI colors, spinners, banner, summary box.
 *
 * Zero-dependency on purpose: ANSI escapes are well-supported in every modern
 * terminal, and we don't want to balloon install size for a CLI that's
 * already fetching Ollama + firebase-admin next door.
 *
 * All color output is auto-disabled when stdout isn't a TTY (pipes, CI logs,
 * captured output), or when NO_COLOR is set — respects the de-facto
 * https://no-color.org spec.
 */

const ENABLE_COLOR =
  process.stdout.isTTY === true &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb';

const ESC = '\x1b[';

function wrap(code: string): (s: string | number) => string {
  if (!ENABLE_COLOR) return (s) => String(s);
  return (s) => `${ESC}${code}m${s}${ESC}0m`;
}

// ─── Colors ─────────────────────────────────────────────────────────────────
export const c = {
  reset: wrap('0'),
  bold: wrap('1'),
  dim: wrap('2'),
  italic: wrap('3'),
  underline: wrap('4'),

  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),

  brightRed: wrap('91'),
  brightGreen: wrap('92'),
  brightYellow: wrap('93'),
  brightCyan: wrap('96'),
  brightMagenta: wrap('95'),
};

// Gradient helper — renders text through a color cycle. Purely cosmetic.
const GRADIENT = ['95', '35', '34', '36', '96']; // magenta → violet → blue → cyan
export function gradient(s: string): string {
  if (!ENABLE_COLOR) return s;
  return s
    .split('')
    .map((ch, i) => {
      const code = GRADIENT[i % GRADIENT.length];
      return `${ESC}${code}m${ch}`;
    })
    .join('') + `${ESC}0m`;
}

// ─── Banner ────────────────────────────────────────────────────────────────
export function banner(version: string): string {
  const title = gradient('✨ schema-gen');
  const sub = c.dim('Schema.org recommendations via local Ollama');
  const ver = c.dim(`v${version}`);
  const line = c.gray('─'.repeat(48));
  return [
    '',
    `  ${title}  ${ver}`,
    `  ${sub}`,
    `  ${line}`,
    '',
  ].join('\n');
}

// ─── Key/value recap block ─────────────────────────────────────────────────
export function recap(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows
    .map(([k, v]) => `  ${c.cyan(k.padEnd(width))}  ${c.dim('·')}  ${v}`)
    .join('\n');
}

// ─── Log helpers — colored single-line status updates ──────────────────────
export function logStart(label: string, url?: string): void {
  const bullet = c.cyan('▸');
  const tag = c.dim(label);
  const suffix = url ? `  ${c.gray(url)}` : '';
  process.stdout.write(`  ${bullet} ${tag}${suffix}\n`);
}

export function logSuccess(label: string, extra?: string, elapsedMs?: number): void {
  const mark = c.green('✓');
  const tag = c.bold(label);
  const ex = extra ? `  ${c.dim('·')} ${c.gray(extra)}` : '';
  const time =
    elapsedMs != null ? `  ${c.dim((elapsedMs / 1000).toFixed(1) + 's')}` : '';
  process.stdout.write(`  ${mark} ${tag}${ex}${time}\n`);
}

export function logError(label: string, message: string): void {
  const mark = c.red('✗');
  process.stdout.write(`  ${mark} ${c.bold(label)}  ${c.red(message)}\n`);
}

export function logWarn(message: string): void {
  process.stdout.write(`  ${c.yellow('!')} ${c.yellow(message)}\n`);
}

export function logInfo(message: string): void {
  process.stdout.write(`  ${c.blue('ℹ')} ${message}\n`);
}

// ─── Spinner — single-line, TTY only ───────────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Spinner {
  update(text: string): void;
  stop(): void;
}

export function spinner(text: string): Spinner {
  // If not a TTY, degrade to a single line print + no-op stop — keeps
  // piped/captured output readable without the \r overwrite dance.
  if (!ENABLE_COLOR) {
    process.stdout.write(`  · ${text}\n`);
    return { update: () => {}, stop: () => {} };
  }

  let current = text;
  let frame = 0;
  const render = () => {
    const g = c.cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
    process.stdout.write(`\r\x1b[2K  ${g} ${current}`);
    frame++;
  };
  render();
  const id = setInterval(render, 80);

  return {
    update(next: string) {
      current = next;
    },
    stop() {
      clearInterval(id);
      process.stdout.write('\r\x1b[2K'); // clear the line
    },
  };
}

// ─── Summary box — final pipeline stats ────────────────────────────────────
export function summary(opts: {
  wrote: number;
  failed: number;
  skipped?: number;
  outPath: string;
  elapsedMs: number;
}): string {
  const ok = opts.failed === 0;
  const border = ok ? c.green : c.yellow;
  const heading = ok ? c.brightGreen('  ✓ Complete') : c.brightYellow('  ⚠ Complete with errors');
  const elapsed = (opts.elapsedMs / 1000).toFixed(1) + 's';

  const rows: Array<[string, string]> = [
    ['succeeded', c.green(String(opts.wrote))],
    ['failed', opts.failed > 0 ? c.red(String(opts.failed)) : c.dim('0')],
  ];
  if (opts.skipped !== undefined && opts.skipped > 0) {
    rows.push(['skipped', c.yellow(String(opts.skipped))]);
  }
  rows.push(['elapsed', c.dim(elapsed)]);
  rows.push(['output', c.cyan(opts.outPath)]);

  const width = Math.max(...rows.map(([k]) => k.length));
  const body = rows
    .map(([k, v]) => `  ${c.dim(k.padEnd(width))}  ${v}`)
    .join('\n');

  return [
    '',
    border('  ━'.repeat(24)),
    heading,
    border('  ━'.repeat(24)),
    body,
    '',
    c.dim('  Next: dashboard → Webflow → Schema tab → Import schema-output.json'),
    '',
  ].join('\n');
}
