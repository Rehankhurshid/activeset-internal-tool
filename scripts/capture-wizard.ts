#!/usr/bin/env node

import { runCaptureWizardCli } from '../packages/activeset-capture/src/bin/capture-wizard';

runCaptureWizardCli(process.argv.slice(2)).catch((error) => {
  console.error(`\nWizard failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
});
