#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import chalk from 'chalk';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents, Key } from 'node:readline';
import { runLocalCapture } from '../src/local-capture/engine';
import { normalizeAndValidateUrls, parseUrlsText } from '../src/local-capture/io';
import { LocalCaptureDevice, LocalCaptureFormat, LocalCaptureWarmupMode } from '../src/local-capture/types';

const IS_TTY = Boolean(input.isTTY && output.isTTY);
const POINTER = '->';

type SelectOption<T> = {
  label: string;
  value: T;
  hint?: string;
};

const WIZARD_HEADER = `
${chalk.cyanBright('ActiveSet Local Screenshot Wizard')}
${chalk.dim('Capture desktop + mobile screenshots locally (with scroll warmup).')}
`;

function printHelp(): void {
  output.write(`
${chalk.cyanBright('ActiveSet Local Screenshot Wizard')}

Usage:
  activeset-capture
  npm run capture:wizard

Controls:
  - Menu selection: Up/Down arrows + Enter
  - Multi-select: Up/Down arrows + Space to toggle + Enter

Tip:
  Non-interactive mode:
  npm run capture:local -- --help
`);
}

function eraseRenderedLines(lineCount: number): void {
  for (let i = 0; i < lineCount; i += 1) {
    output.write('\x1b[1A');
    output.write('\x1b[2K');
  }
}

async function askText(label: string, defaultValue = ''): Promise<string> {
  const rl = createInterface({ input, output });
  const suffix = defaultValue ? ` ${chalk.dim(`[${defaultValue}]`)}` : '';
  const answer = await rl.question(`${chalk.cyan('?')} ${label}${suffix}: `);
  rl.close();
  const trimmed = answer.trim();
  return trimmed || defaultValue;
}

async function selectOne<T>(
  title: string,
  options: SelectOption<T>[],
  initialIndex = 0
): Promise<T> {
  if (!IS_TTY) return options[initialIndex].value;

  emitKeypressEvents(input);
  input.resume();
  input.setRawMode?.(true);

  let index = Math.max(0, Math.min(initialIndex, options.length - 1));
  let lines = 0;

  const render = () => {
    if (lines > 0) eraseRenderedLines(lines);
    const buffer: string[] = [];
    buffer.push(`${chalk.cyan('>')} ${chalk.bold(title)}`);
    buffer.push(chalk.dim('Use Up/Down arrows, press Enter to confirm.'));
    options.forEach((option, i) => {
      const marker = i === index ? chalk.green(POINTER) : '  ';
      const hint = option.hint ? ` ${chalk.dim(`(${option.hint})`)}` : '';
      buffer.push(`${marker} ${option.label}${hint}`);
    });
    output.write(`${buffer.join('\n')}\n`);
    lines = buffer.length;
  };

  render();

  return new Promise<T>((resolve, reject) => {
    const onKeyPress = (_str: string, key: Key) => {
      if (key.name === 'up') {
        index = index === 0 ? options.length - 1 : index - 1;
        render();
        return;
      }
      if (key.name === 'down') {
        index = index === options.length - 1 ? 0 : index + 1;
        render();
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(options[index].value);
        return;
      }
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Cancelled by user'));
      }
    };

    const cleanup = () => {
      input.off('keypress', onKeyPress);
      input.setRawMode?.(false);
      output.write('\n');
    };

    input.on('keypress', onKeyPress);
  });
}

async function selectMany<T>(
  title: string,
  options: SelectOption<T>[],
  initiallySelected: T[]
): Promise<T[]> {
  if (!IS_TTY) return initiallySelected;

  emitKeypressEvents(input);
  input.resume();
  input.setRawMode?.(true);

  let index = 0;
  let lines = 0;
  const selected = new Set(options
    .map((option, optionIndex) => ({ option, optionIndex }))
    .filter(({ option }) => initiallySelected.includes(option.value))
    .map(({ optionIndex }) => optionIndex));

  const render = (errorMessage = '') => {
    if (lines > 0) eraseRenderedLines(lines);
    const buffer: string[] = [];
    buffer.push(`${chalk.cyan('>')} ${chalk.bold(title)}`);
    buffer.push(chalk.dim('Use Up/Down arrows, Space to toggle, Enter to confirm.'));
    options.forEach((option, i) => {
      const marker = i === index ? chalk.green(POINTER) : '  ';
      const checked = selected.has(i) ? chalk.green('[x]') : chalk.dim('[ ]');
      const hint = option.hint ? ` ${chalk.dim(`(${option.hint})`)}` : '';
      buffer.push(`${marker} ${checked} ${option.label}${hint}`);
    });
    if (errorMessage) buffer.push(chalk.red(errorMessage));
    output.write(`${buffer.join('\n')}\n`);
    lines = buffer.length;
  };

  render();

  return new Promise<T[]>((resolve, reject) => {
    const onKeyPress = (str: string, key: Key) => {
      if (key.name === 'up') {
        index = index === 0 ? options.length - 1 : index - 1;
        render();
        return;
      }
      if (key.name === 'down') {
        index = index === options.length - 1 ? 0 : index + 1;
        render();
        return;
      }
      if (key.name === 'space' || str === ' ') {
        if (selected.has(index)) selected.delete(index);
        else selected.add(index);
        render();
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        if (selected.size === 0) {
          render('Select at least one item.');
          return;
        }
        cleanup();
        resolve(Array.from(selected).sort((a, b) => a - b).map((i) => options[i].value));
        return;
      }
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('Cancelled by user'));
      }
    };

    const cleanup = () => {
      input.off('keypress', onKeyPress);
      input.setRawMode?.(false);
      output.write('\n');
    };

    input.on('keypress', onKeyPress);
  });
}

function toSafeInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function collectUrlsInteractive(): Promise<string[]> {
  output.write(`${chalk.yellow('Paste URLs one per line. Submit empty line to finish.')}\n`);
  const lines: string[] = [];
  while (true) {
    const prompt = lines.length === 0 ? 'URL 1' : `URL ${lines.length + 1}`;
    const line = await askText(prompt);
    if (!line.trim()) break;
    lines.push(line);
  }
  return lines;
}

async function collectUrlsFromFile(): Promise<string[]> {
  const filePath = await askText('Path to URL file');
  const fileText = await fs.readFile(filePath.trim(), 'utf8');
  return parseUrlsText(fileText);
}

async function runWizard(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  output.write(WIZARD_HEADER);

  if (!IS_TTY) {
    output.write(`${chalk.red('Interactive wizard requires a TTY terminal.')}\n`);
    output.write(`Use ${chalk.bold('npm run capture:local -- --help')} for non-interactive mode.\n`);
    process.exit(1);
  }

  const projectName = await askText('Project name', 'New Client Project');

  const source = await selectOne('How do you want to provide URLs?', [
    { label: 'Paste URLs now', value: 'paste' as const },
    { label: 'Load URLs from a text file', value: 'file' as const },
  ]);

  const rawUrls = source === 'file' ? await collectUrlsFromFile() : await collectUrlsInteractive();
  const urls = normalizeAndValidateUrls(rawUrls);

  if (urls.length === 0) {
    output.write(`${chalk.red('\nNo valid HTTP/HTTPS URLs provided. Aborting.\n')}`);
    return;
  }

  output.write(`${chalk.green(`\nValidated URLs: ${urls.length}\n`)}`);

  const outputDir = await askText('Output folder', './captures');
  const devices = await selectMany<LocalCaptureDevice>(
    'Select devices',
    [
      { label: 'Desktop', value: 'desktop', hint: '1280x800' },
      { label: 'Mobile', value: 'mobile', hint: '375x812 + mobile UA' },
    ],
    ['desktop', 'mobile']
  );

  const format = await selectOne<LocalCaptureFormat>(
    'Select output format',
    [
      { label: 'WEBP', value: 'webp', hint: 'smaller files' },
      { label: 'PNG', value: 'png', hint: 'lossless' },
    ],
    0
  );

  const warmup = await selectOne<LocalCaptureWarmupMode>(
    'Warmup scroll mode',
    [
      { label: 'Always (recommended)', value: 'always' },
      { label: 'Off', value: 'off' },
    ],
    0
  );

  const concurrency = toSafeInteger(await askText('Concurrency', '3'), 3);
  const timeoutMs = toSafeInteger(await askText('Timeout per URL (ms)', '45000'), 45000);
  const retries = toSafeInteger(await askText('Retries', '1'), 1);

  output.write(`\n${chalk.cyanBright('Summary')}\n`);
  output.write(`  ${chalk.dim('Project:')}     ${projectName}\n`);
  output.write(`  ${chalk.dim('URLs:')}        ${urls.length}\n`);
  output.write(`  ${chalk.dim('Output:')}      ${outputDir}\n`);
  output.write(`  ${chalk.dim('Devices:')}     ${devices.join(', ')}\n`);
  output.write(`  ${chalk.dim('Format:')}      ${format}\n`);
  output.write(`  ${chalk.dim('Warmup:')}      ${warmup}\n`);
  output.write(`  ${chalk.dim('Concurrency:')} ${concurrency}\n`);
  output.write(`  ${chalk.dim('Timeout:')}     ${timeoutMs}ms\n`);
  output.write(`  ${chalk.dim('Retries:')}     ${retries}\n`);

  const shouldRun = await selectOne<boolean>('Start capture now?', [
    { label: 'Yes, start capture', value: true },
    { label: 'No, cancel', value: false },
  ]);

  if (!shouldRun) {
    output.write(`${chalk.yellow('\nCapture cancelled by user.\n')}`);
    return;
  }

  output.write(`\n${chalk.cyanBright('Running capture...')}\n`);

  const captureOutput = await runLocalCapture({
    projectName,
    urls,
    outputDir,
    concurrency,
    timeoutMs,
    retries,
    devices,
    format,
    warmup,
    onProgress: (event) => {
      if (event.type === 'url-start') {
        output.write(chalk.dim(`[${event.index}/${event.totalUrls}] Capturing ${event.url} (attempt ${event.attempt})\n`));
        return;
      }

      if (event.type === 'url-complete') {
        const status =
          event.result.status === 'success'
            ? chalk.green(event.result.status.toUpperCase())
            : chalk.red(event.result.status.toUpperCase());
        output.write(`[${event.completedUrls}/${event.totalUrls}] ${status} ${event.result.url} (${event.result.durationMs}ms)\n`);
      }
    },
  });

  output.write(`\n${chalk.greenBright('Done.')}\n`);
  output.write(`${chalk.dim('Manifest:')} ${captureOutput.manifestPath}\n`);
  output.write(`${chalk.dim('Output:')}   ${captureOutput.runDirectory}\n`);

  if (captureOutput.errorsPath) {
    output.write(`${chalk.yellow('Errors:')}   ${captureOutput.errorsPath}\n`);
  }
}

runWizard().catch((error) => {
  output.write(`\n${chalk.red('Wizard failed:')} ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exit(1);
});
