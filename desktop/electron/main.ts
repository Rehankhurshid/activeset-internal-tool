// @ts-nocheck

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererPath = path.join(__dirname, 'renderer', 'index.html');
  mainWindow.loadFile(rendererPath);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-output-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (!targetPath) return false;
  await shell.openPath(targetPath);
  return true;
});

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'capture-run';
}

ipcMain.handle('create-temp-urls-file', async (_event, payload) => {
  const projectName = payload?.projectName || 'capture-run';
  const urlsText = payload?.urlsText || '';

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-runner-'));
  const filePath = path.join(tempDir, `${slugify(projectName)}-urls.txt`);
  fs.writeFileSync(filePath, urlsText, 'utf8');
  return filePath;
});

ipcMain.handle('run-local-capture', async (_event, payload) => {
  return new Promise((resolve) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const args = [
      'run',
      'capture:local',
      '--',
      '--project',
      payload.projectName,
      '--file',
      payload.urlsFilePath,
      '--out',
      payload.outputDir,
      '--devices',
      payload.devices || 'desktop,mobile',
      '--warmup',
      payload.warmup || 'always',
      '--format',
      payload.format || 'webp',
      '--concurrency',
      String(payload.concurrency || 3),
      '--timeout-ms',
      String(payload.timeoutMs || 45000),
      '--retries',
      String(payload.retries || 1),
    ];

    const projectRoot = path.resolve(__dirname, '..', '..');
    const child = spawn(npmCommand, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      mainWindow?.webContents.send('capture-log', { stream: 'stdout', text });
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      mainWindow?.webContents.send('capture-log', { stream: 'stderr', text });
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        code: -1,
        stdout,
        stderr: `${stderr}\n${error.message}`,
      });
    });
  });
});
