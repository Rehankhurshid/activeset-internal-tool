#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const capture_local_1 = require("./capture-local");
const capture_upload_1 = require("./capture-upload");
const capture_wizard_1 = require("./capture-wizard");
function printHelp() {
    console.log(`
@activeset/capture

Usage:
  activeset-capture                         Open the interactive wizard
  activeset-capture wizard                  Open the interactive wizard
  activeset-capture run [options]           Run capture directly without the wizard
  activeset-capture upload <dir> --to <url> Upload an existing capture run

Examples:
  npx @activeset/capture
  npx @activeset/capture run --project "My Project" --file ./urls.txt
  npx @activeset/capture upload ./captures/my-run --to https://app.activeset.co

Tip:
  Passing flags directly also works:
  activeset-capture --project "My Project" --file ./urls.txt
`);
}
async function main() {
    const argv = process.argv.slice(2);
    const [mode, ...rest] = argv;
    if (!mode) {
        await (0, capture_wizard_1.runCaptureWizardCli)([]);
        return;
    }
    if (mode === '--help' || mode === '-h' || mode === 'help') {
        printHelp();
        return;
    }
    if (mode === 'wizard') {
        await (0, capture_wizard_1.runCaptureWizardCli)(rest);
        return;
    }
    if (mode === 'run' || mode === 'capture' || mode === 'local') {
        await (0, capture_local_1.runCaptureLocalCli)(rest);
        return;
    }
    if (mode === 'upload') {
        await (0, capture_upload_1.runCaptureUploadCli)(rest);
        return;
    }
    if (mode.startsWith('--')) {
        await (0, capture_local_1.runCaptureLocalCli)(argv);
        return;
    }
    throw new Error(`Unknown subcommand: ${mode}`);
}
main().catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Use --help to see available modes.');
    process.exit(1);
});
//# sourceMappingURL=activeset-capture.js.map