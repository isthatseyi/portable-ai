// Portable AI — github.com/isthatseyi/portable-ai
// preload.js
/*
 * Copyright (C) 2024-2026 Sammuel Oluwaseyi Johnson
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, version 3 of the License only.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
 * License for more details: <https://www.gnu.org/licenses/agpl-3.0.html>.
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
  'pick-migration-dir', 'execute-migration', 'get-system-info', 'get-drive-space',
  'get-model-catalog', 'refresh-model-catalog', 'check-updates',
  'connector-mode', 'get-lan-info', 'workspace-list', 'workspace-read',
  'open-custom-dir', 'mirror-custom'
];

const ALLOWED_EVENT_CHANNELS = ['cache-move-progress', 'migration-progress', 'ollama-reused'];

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
  // Model catalog: cached read is offline; refresh reaches ollama.com and runs
  // in the MAIN process only, keeping the renderer itself network-free.
  getModelCatalog: () => ipcRenderer.invoke('get-model-catalog'),
  refreshModelCatalog: () => ipcRenderer.invoke('refresh-model-catalog'),
});