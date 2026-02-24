#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs/promises"));
const chalk_1 = __importDefault(require("chalk"));
const node_process_1 = require("node:process");
const promises_1 = require("node:readline/promises");
const node_readline_1 = require("node:readline");
const engine_1 = require("../core/engine");
const io_1 = require("../core/io");
const IS_TTY = Boolean(node_process_1.stdin.isTTY && node_process_1.stdout.isTTY);
const POINTER = '->';
const WIZARD_HEADER = `
${chalk_1.default.cyanBright('ActiveSet Local Screenshot Wizard')}
${chalk_1.default.dim('Capture desktop + mobile screenshots locally (with scroll warmup).')}
`;
function printHelp() {
    node_process_1.stdout.write(`
${chalk_1.default.cyanBright('ActiveSet Local Screenshot Wizard')}

Usage:
  activeset-capture

Controls:
  - Menu selection: Up/Down arrows + Enter
  - Multi-select: Up/Down arrows + Space to toggle + Enter
`);
}
function eraseRenderedLines(lineCount) {
    for (let i = 0; i < lineCount; i += 1) {
        node_process_1.stdout.write('\x1b[1A');
        node_process_1.stdout.write('\x1b[2K');
    }
}
async function askText(label, defaultValue = '') {
    const rl = (0, promises_1.createInterface)({ input: node_process_1.stdin, output: node_process_1.stdout });
    const suffix = defaultValue ? ` ${chalk_1.default.dim(`[${defaultValue}]`)}` : '';
    const answer = await rl.question(`${chalk_1.default.cyan('?')} ${label}${suffix}: `);
    rl.close();
    const trimmed = answer.trim();
    return trimmed || defaultValue;
}
async function selectOne(title, options, initialIndex = 0) {
    if (!IS_TTY)
        return options[initialIndex].value;
    (0, node_readline_1.emitKeypressEvents)(node_process_1.stdin);
    node_process_1.stdin.resume();
    node_process_1.stdin.setRawMode?.(true);
    let index = Math.max(0, Math.min(initialIndex, options.length - 1));
    let lines = 0;
    const render = () => {
        if (lines > 0)
            eraseRenderedLines(lines);
        const buffer = [];
        buffer.push(`${chalk_1.default.cyan('>')} ${chalk_1.default.bold(title)}`);
        buffer.push(chalk_1.default.dim('Use Up/Down arrows, press Enter to confirm.'));
        options.forEach((option, i) => {
            const marker = i === index ? chalk_1.default.green(POINTER) : '  ';
            const hint = option.hint ? ` ${chalk_1.default.dim(`(${option.hint})`)}` : '';
            buffer.push(`${marker} ${option.label}${hint}`);
        });
        node_process_1.stdout.write(`${buffer.join('\n')}\n`);
        lines = buffer.length;
    };
    render();
    return new Promise((resolve, reject) => {
        const onKeyPress = (_str, key) => {
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
            node_process_1.stdin.off('keypress', onKeyPress);
            node_process_1.stdin.setRawMode?.(false);
            node_process_1.stdout.write('\n');
        };
        node_process_1.stdin.on('keypress', onKeyPress);
    });
}
async function selectMany(title, options, initiallySelected) {
    if (!IS_TTY)
        return initiallySelected;
    (0, node_readline_1.emitKeypressEvents)(node_process_1.stdin);
    node_process_1.stdin.resume();
    node_process_1.stdin.setRawMode?.(true);
    let index = 0;
    let lines = 0;
    const selected = new Set(options
        .map((option, optionIndex) => ({ option, optionIndex }))
        .filter(({ option }) => initiallySelected.includes(option.value))
        .map(({ optionIndex }) => optionIndex));
    const render = (errorMessage = '') => {
        if (lines > 0)
            eraseRenderedLines(lines);
        const buffer = [];
        buffer.push(`${chalk_1.default.cyan('>')} ${chalk_1.default.bold(title)}`);
        buffer.push(chalk_1.default.dim('Use Up/Down arrows, Space to toggle, Enter to confirm.'));
        options.forEach((option, i) => {
            const marker = i === index ? chalk_1.default.green(POINTER) : '  ';
            const checked = selected.has(i) ? chalk_1.default.green('[x]') : chalk_1.default.dim('[ ]');
            const hint = option.hint ? ` ${chalk_1.default.dim(`(${option.hint})`)}` : '';
            buffer.push(`${marker} ${checked} ${option.label}${hint}`);
        });
        if (errorMessage)
            buffer.push(chalk_1.default.red(errorMessage));
        node_process_1.stdout.write(`${buffer.join('\n')}\n`);
        lines = buffer.length;
    };
    render();
    return new Promise((resolve, reject) => {
        const onKeyPress = (str, key) => {
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
                if (selected.has(index))
                    selected.delete(index);
                else
                    selected.add(index);
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
            node_process_1.stdin.off('keypress', onKeyPress);
            node_process_1.stdin.setRawMode?.(false);
            node_process_1.stdout.write('\n');
        };
        node_process_1.stdin.on('keypress', onKeyPress);
    });
}
function toSafeInteger(value, fallback) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}
async function collectUrlsInteractive() {
    node_process_1.stdout.write(`${chalk_1.default.yellow('Paste URLs one per line. Submit empty line to finish.')}\n`);
    const lines = [];
    while (true) {
        const prompt = lines.length === 0 ? 'URL 1' : `URL ${lines.length + 1}`;
        const line = await askText(prompt);
        if (!line.trim())
            break;
        lines.push(line);
    }
    return lines;
}
async function collectUrlsFromFile() {
    const filePath = await askText('Path to URL file');
    const fileText = await fs.readFile(filePath.trim(), 'utf8');
    return (0, io_1.parseUrlsText)(fileText);
}
async function runWizard() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }
    node_process_1.stdout.write(WIZARD_HEADER);
    if (!IS_TTY) {
        node_process_1.stdout.write(`${chalk_1.default.red('Interactive wizard requires a TTY terminal.')}\n`);
        node_process_1.stdout.write(`Run this command in a terminal window (not a background process).\n`);
        process.exit(1);
    }
    const projectName = await askText('Project name', 'New Client Project');
    const source = await selectOne('How do you want to provide URLs?', [
        { label: 'Paste URLs now', value: 'paste' },
        { label: 'Load URLs from a text file', value: 'file' },
    ]);
    const rawUrls = source === 'file' ? await collectUrlsFromFile() : await collectUrlsInteractive();
    const urls = (0, io_1.normalizeAndValidateUrls)(rawUrls);
    if (urls.length === 0) {
        node_process_1.stdout.write(`${chalk_1.default.red('\nNo valid HTTP/HTTPS URLs provided. Aborting.\n')}`);
        return;
    }
    node_process_1.stdout.write(`${chalk_1.default.green(`\nValidated URLs: ${urls.length}\n`)}`);
    const outputDir = await askText('Output folder', './captures');
    const devices = await selectMany('Select devices', [
        { label: 'Desktop', value: 'desktop', hint: '1280x800' },
        { label: 'Mobile', value: 'mobile', hint: '375x812 + mobile UA' },
    ], ['desktop', 'mobile']);
    const format = await selectOne('Select output format', [
        { label: 'WEBP', value: 'webp', hint: 'smaller files' },
        { label: 'PNG', value: 'png', hint: 'lossless' },
    ], 0);
    const warmup = await selectOne('Warmup scroll mode', [
        { label: 'Always (recommended)', value: 'always' },
        { label: 'Off', value: 'off' },
    ], 0);
    const concurrency = toSafeInteger(await askText('Concurrency', '3'), 3);
    const timeoutMs = toSafeInteger(await askText('Timeout per URL (ms)', '45000'), 45000);
    const retries = toSafeInteger(await askText('Retries', '1'), 1);
    node_process_1.stdout.write(`\n${chalk_1.default.cyanBright('Summary')}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Project:')}     ${projectName}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('URLs:')}        ${urls.length}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Output:')}      ${outputDir}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Devices:')}     ${devices.join(', ')}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Format:')}      ${format}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Warmup:')}      ${warmup}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Concurrency:')} ${concurrency}\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Timeout:')}     ${timeoutMs}ms\n`);
    node_process_1.stdout.write(`  ${chalk_1.default.dim('Retries:')}     ${retries}\n`);
    const shouldRun = await selectOne('Start capture now?', [
        { label: 'Yes, start capture', value: true },
        { label: 'No, cancel', value: false },
    ]);
    if (!shouldRun) {
        node_process_1.stdout.write(`${chalk_1.default.yellow('\nCapture cancelled by user.\n')}`);
        return;
    }
    node_process_1.stdout.write(`\n${chalk_1.default.cyanBright('Running capture...')}\n`);
    const captureOutput = await (0, engine_1.runLocalCapture)({
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
                node_process_1.stdout.write(chalk_1.default.dim(`[${event.index}/${event.totalUrls}] Capturing ${event.url} (attempt ${event.attempt})\n`));
                return;
            }
            if (event.type === 'url-complete') {
                const status = event.result.status === 'success'
                    ? chalk_1.default.green(event.result.status.toUpperCase())
                    : chalk_1.default.red(event.result.status.toUpperCase());
                node_process_1.stdout.write(`[${event.completedUrls}/${event.totalUrls}] ${status} ${event.result.url} (${event.result.durationMs}ms)\n`);
            }
        },
    });
    node_process_1.stdout.write(`\n${chalk_1.default.greenBright('Done.')}\n`);
    node_process_1.stdout.write(`${chalk_1.default.dim('Manifest:')} ${captureOutput.manifestPath}\n`);
    node_process_1.stdout.write(`${chalk_1.default.dim('Output:')}   ${captureOutput.runDirectory}\n`);
    if (captureOutput.errorsPath) {
        node_process_1.stdout.write(`${chalk_1.default.yellow('Errors:')}   ${captureOutput.errorsPath}\n`);
    }
}
runWizard().catch((error) => {
    node_process_1.stdout.write(`\n${chalk_1.default.red('Wizard failed:')} ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exit(1);
});
//# sourceMappingURL=capture-wizard.js.map