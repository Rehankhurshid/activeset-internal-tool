// @ts-nocheck

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localCaptureDesktop', {
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  createTempUrlsFile: (payload) => ipcRenderer.invoke('create-temp-urls-file', payload),
  runCapture: (payload) => ipcRenderer.invoke('run-local-capture', payload),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  onLog: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('capture-log', listener);
    return () => ipcRenderer.removeListener('capture-log', listener);
  },
});
