// Portable AI — github.com/isthatseyi/portable-ai
// preload.js
/*
 * Copyright © 2024-2026 Sammuel Oluwaseyi Johnson. All rights reserved.
 * 
 * This software and its source code are proprietary and confidential.
 * Unauthorized copying, distribution, or use is strictly prohibited.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('runtime', {
  // setTemperature: (t) => { /* connect to your backend if needed */ }
});
contextBridge.exposeInMainWorld('models', {
  openDir: () => ipcRenderer.invoke('open-models-dir'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  pickDir: () => ipcRenderer.invoke('pick-models-dir'),
  setDir: (path) => ipcRenderer.invoke('set-models-dir', path)
});

const ALLOWED_CHANNELS = [
  'get-port', 'get-runtime', 'get-settings', 'save-settings',
  'open-models-dir', 'get-config', 'pick-models-dir', 'set-models-dir',
  'restart-ollama', 'prepare-cache-install', 'finish-cache-install',
  'pick-migration-dir', 'execute-migration', 'get-system-info', 'get-drive-space'
];

const ALLOWED_EVENT_CHANNELS = ['cache-move-progress', 'migration-progress'];

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    if (ALLOWED_EVENT_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  restartOllama: () => ipcRenderer.invoke('restart-ollama'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getPort: () => ipcRenderer.invoke('get-port'),
  getRuntime: () => ipcRenderer.invoke('get-runtime'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getDriveSpace: () => ipcRenderer.invoke('get-drive-space'),
});