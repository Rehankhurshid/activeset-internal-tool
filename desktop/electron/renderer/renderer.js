const projectNameInput = document.getElementById('projectName');
const urlsInput = document.getElementById('urls');
const outputDirInput = document.getElementById('outputDir');
const concurrencyInput = document.getElementById('concurrency');
const logs = document.getElementById('logs');
const chooseDirButton = document.getElementById('chooseDir');
const runCaptureButton = document.getElementById('runCapture');
const openFolderButton = document.getElementById('openFolder');

let lastOutputDir = outputDirInput.value;

function appendLog(message) {
  logs.textContent += `${message}\n`;
  logs.scrollTop = logs.scrollHeight;
}

function parseUrls(input) {
  return input
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((token) => token.trim())
    .filter(Boolean);
}

chooseDirButton.addEventListener('click', async () => {
  const selected = await window.localCaptureDesktop.selectOutputDirectory();
  if (!selected) return;
  outputDirInput.value = selected;
  lastOutputDir = selected;
});

openFolderButton.addEventListener('click', async () => {
  await window.localCaptureDesktop.openPath(lastOutputDir);
});

window.localCaptureDesktop.onLog(({ text }) => {
  appendLog(text.replace(/\s+$/g, ''));
});

runCaptureButton.addEventListener('click', async () => {
  const projectName = projectNameInput.value.trim();
  const urls = parseUrls(urlsInput.value);

  if (!projectName) {
    appendLog('Project name is required.');
    return;
  }

  if (urls.length === 0) {
    appendLog('At least one URL is required.');
    return;
  }

  const urlsFilePath = await window.localCaptureDesktop.createTempUrlsFile({
    projectName,
    urlsText: `${urls.join('\n')}\n`,
  });

  runCaptureButton.disabled = true;
  appendLog('Starting capture...');

  try {
    const result = await window.localCaptureDesktop.runCapture({
      projectName,
      urlsFilePath,
      outputDir: outputDirInput.value.trim() || './captures',
      devices: 'desktop,mobile',
      warmup: 'always',
      format: 'webp',
      concurrency: Number.parseInt(concurrencyInput.value || '3', 10),
      timeoutMs: 45000,
      retries: 1,
    });

    if (result.success) {
      appendLog('Capture completed successfully.');
      lastOutputDir = outputDirInput.value.trim() || './captures';
    } else {
      appendLog(`Capture failed with exit code ${result.code}.`);
    }
  } catch (error) {
    appendLog(`Capture crashed: ${error.message || 'Unknown error'}`);
  } finally {
    runCaptureButton.disabled = false;
  }
});
