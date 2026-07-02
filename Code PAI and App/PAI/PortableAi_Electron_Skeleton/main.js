// Portable AI — github.com/isthatseyi/portable-ai
// PortableAI — Electron bootstrap (portable + embedded Ollama)
// Copyright © 2024-2026 Sammuel Oluwaseyi Johnson. All rights reserved.
//
// This software and its source code are proprietary and confidential.
// Unauthorized copying, distribution, or use is strictly prohibited.
'use strict';

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const http = require('http');
const net = require('net');
const childProcess = require('child_process');

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  const msg = `[PortableAI] Uncaught Exception: ${error.message}\n${error.stack}`;
  try { fs.appendFileSync(path.join(getPortableRoot(), 'app_data', 'data', 'ollama.log'), msg); } catch { }
  dialog.showErrorBox('PortableAI Error', `An unexpected error occurred:\n${error.message}`);
});


// ---------- Portable root (shared across macOS + Windows) ----------
// The "portable root" is the folder we treat as the writable base for app_data
// (models, config, logs). It must be located on the USB stick, never on the OS
// drive, so Electron/Ollama never write "junk on the HD".
//
// Detection strategy (robust for BOTH `npm start` dev and packaged builds):
//  • Windows portable exe: electron-builder sets PORTABLE_EXECUTABLE_DIR to the
//    folder the .exe was launched from — the most reliable anchor on Windows.
//  • macOS packaged: process.execPath = .../PortableAI.app/Contents/MacOS/PortableAI
//    We walk up out of the .app bundle. The .app may live in a subfolder of the
//    stick (e.g. "PortableAi (mac)/"), so the folder that *contains* the .app is
//    a safe, always-writable base — we do NOT assume it sits at the drive root.
//  • Dev (`npm start`): use the project directory (__dirname).
function getPortableRoot() {
  // Windows portable build — most reliable anchor.
  if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR);
  }

  if (app.isPackaged) {
    if (process.platform === 'darwin') {
      // execPath: .../<container>/PortableAI.app/Contents/MacOS/PortableAI
      //   dirname → .../Contents/MacOS
      //   ../../.. → the folder that CONTAINS PortableAI.app (writable, on stick)
      return path.resolve(path.dirname(process.execPath), '..', '..', '..');
    }
    // Generic Windows/Linux packaged fallback: folder next to the executable.
    return path.resolve(path.dirname(process.execPath));
  }

  // Dev: project root (lets you test locally with `npm start`).
  return path.resolve(__dirname);
}

// Where the bundled Ollama binaries + companion libs live.
//  • Packaged: process.resourcesPath (extraResources land here).
//  • Dev: <project>/resources.
function getResourcesDir() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
}

const PORTABLE_ROOT = getPortableRoot();
const APP_DATA_DIR = path.join(PORTABLE_ROOT, 'app_data');
const DEFAULT_MODELS_DIR = path.join(APP_DATA_DIR, 'models');
const DATA_DIR = path.join(APP_DATA_DIR, 'data');      // chats/sessions/logs live here
const LOG_FILE = path.join(APP_DATA_DIR, 'data', 'ollama.log');
const CONFIG_FILE = path.join(APP_DATA_DIR, 'config', 'portable-settings.json');
const RUNTIME_FILE = path.join(APP_DATA_DIR, 'config', 'runtime.json');
const SETTINGS_FILE = path.join(APP_DATA_DIR, 'config', 'settings.json');

let OLLAMA_PORT = 11435; // Will be updated by findFreePort()

// ---------- Ensure app_data subdirs (detect existing, create if absent) ----------
function ensureDir(dir) {
  if (fs.existsSync(dir)) return false; // already present — survives updates
  try { fs.mkdirSync(dir, { recursive: true }); } catch { }
  return true; // newly created
}

[
  APP_DATA_DIR,
  path.join(APP_DATA_DIR, 'models'),
  path.join(APP_DATA_DIR, 'data'),
  path.join(APP_DATA_DIR, 'data', 'sessions'),
  path.join(APP_DATA_DIR, 'config'),
  path.join(APP_DATA_DIR, 'resources'),
  path.join(APP_DATA_DIR, 'scripts'),
].forEach(dir => ensureDir(dir));

// Make Electron's writable dirs portable — must run BEFORE app is ready so
// Electron never scatters caches/sessions onto the OS drive ("junk on HD" fix).
// Each setPath is wrapped so a failure on one path (e.g. exFAT quirk) can't abort boot.
(function relocateElectronPaths() {
  const relocations = [
    ['userData', DATA_DIR],
    ['sessionData', path.join(DATA_DIR, 'session')],
    ['cache', path.join(DATA_DIR, 'cache')],
    ['temp', path.join(DATA_DIR, 'temp')],
    ['crashDumps', path.join(DATA_DIR, 'crashes')],
  ];
  for (const [key, dir] of relocations) {
    try {
      ensureDir(dir);
      app.setPath(key, dir);
    } catch (e) {
      // 'temp'/'crashDumps' may not always be settable — never fatal.
      try { console.error(`[PortableAI] Could not relocate path '${key}': ${e.message}`); } catch { }
    }
  }
})();

// ---------- Logging ----------
function logLine(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}\n`;
  try { fs.appendFileSync(LOG_FILE, msg); } catch (_) { }
  console.log(msg.trim());
}
logLine(`[PortableAI] Booting v2.1... userData = ${app.getPath('userData')}`);

// ---------- One-time migration from old path layout ----------
function migrateOldPaths() {
  const OLD_MODELS = path.join(PORTABLE_ROOT, 'ollama_models');
  const OLD_APPDATA = path.join(PORTABLE_ROOT, 'appdata');
  const OLD_LOG = path.join(PORTABLE_ROOT, 'ollama-embedded.log');
  const OLD_CONFIG = path.join(PORTABLE_ROOT, 'config', 'settings.json');

  // ollama_models → app_data/models  (only if destination has no blobs yet)
  if (fs.existsSync(OLD_MODELS) && !fs.existsSync(path.join(DEFAULT_MODELS_DIR, 'blobs'))) {
    try {
      fse.moveSync(OLD_MODELS, DEFAULT_MODELS_DIR, { overwrite: false });
      logLine('[PortableAI] Migration: ollama_models → app_data/models');
    } catch (e) { logLine(`[PortableAI] Migration models error: ${e.message}`); }
  }

  // appdata → app_data/data
  if (fs.existsSync(OLD_APPDATA)) {
    try {
      fse.copySync(OLD_APPDATA, DATA_DIR, { overwrite: false });
      fse.removeSync(OLD_APPDATA);
      logLine('[PortableAI] Migration: appdata → app_data/data');
    } catch (e) { logLine(`[PortableAI] Migration appdata error: ${e.message}`); }
  }

  // ollama-embedded.log → app_data/data/ollama.log
  if (fs.existsSync(OLD_LOG) && !fs.existsSync(LOG_FILE)) {
    try {
      fse.moveSync(OLD_LOG, LOG_FILE);
      logLine('[PortableAI] Migration: ollama-embedded.log → app_data/data/ollama.log');
    } catch (e) { logLine(`[PortableAI] Migration log error: ${e.message}`); }
  }

  // config/settings.json → app_data/config/settings.json
  if (fs.existsSync(OLD_CONFIG) && !fs.existsSync(SETTINGS_FILE)) {
    try {
      fse.copySync(OLD_CONFIG, SETTINGS_FILE);
      logLine('[PortableAI] Migration: config/settings.json → app_data/config/settings.json');
    } catch (e) { logLine(`[PortableAI] Migration settings error: ${e.message}`); }
  }
}
migrateOldPaths();

// ---------- Config Persistence ----------
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    logLine(`[PortableAI] Error loading config: ${e.message}`);
  }
  return {};
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (e) {
    logLine(`[PortableAI] Error saving config: ${e.message}`);
  }
}

// ---------- User settings (config/settings.json) ----------
// This is the file the renderer's Settings panel reads/writes (theme, temperature,
// contextLength, default_model, etc.). Kept separate from CONFIG_FILE (which stores
// runtime-only state like customModelsPath). Both live under app_data/config on the stick.
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {};
    }
  } catch (e) {
    logLine(`[PortableAI] Error loading settings.json: ${e.message}`);
  }
  return {};
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    // Write atomically-ish: temp file then rename, so a crash mid-write can't corrupt settings.
    const tmp = `${SETTINGS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, SETTINGS_FILE);
    return true;
  } catch (e) {
    logLine(`[PortableAI] Error saving settings.json: ${e.message}`);
    return false;
  }
}

// ---------- runtime.json ({ port, pid, os, arch, timestamp }) ----------
// Written when Ollama comes up; removed on clean shutdown. Lets external tools /
// the next launch know what port + PID the current session is using.
function writeRuntimeFile(pid, modelsDir) {
  try {
    fs.mkdirSync(path.dirname(RUNTIME_FILE), { recursive: true });
    const runtimeInfo = {
      port: OLLAMA_PORT,
      pid: pid || 0,               // 0 = we did not spawn it (reusing an external server)
      os: process.platform,
      arch: process.arch,
      timestamp: new Date().toISOString(),
      model_dir: modelsDir,
      version: app.getVersion(),
    };
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtimeInfo, null, 2));
    logLine(`[PortableAI] Wrote runtime.json (port=${OLLAMA_PORT}, pid=${runtimeInfo.pid})`);
  } catch (e) {
    logLine(`[PortableAI] Failed to write runtime.json: ${e.message}`);
  }
}

// ---------- Find embedded Ollama binary ----------
// Ollama v0.21.2 ships as a *directory* of files, not a single binary:
//  • macOS:   resources/ollama-darwin/ollama   (+ dylibs, mlx_metal_v3/v4 beside it)
//  • Windows: resources/ollama-windows-amd64/ollama.exe   (+ lib/ beside it)
// The companion libs MUST sit next to the binary (we also set cwd there on spawn),
// otherwise Metal (mac) / CUDA (win) backends fail to load and Ollama silently
// falls back to CPU — the exact symptom behind the "RTX 5070 ignored" report.
function findOllamaBin() {
  const RES = getResourcesDir(); // packaged: process.resourcesPath; dev: <project>/resources
  const candidates = [];

  if (process.platform === 'darwin') {
    // User-placed override first (drop a full ollama-darwin/ into app_data/resources/).
    candidates.push(path.join(APP_DATA_DIR, 'resources', 'ollama-darwin', 'ollama'));
    // Primary: v0.21.2 multi-file bundle.
    candidates.push(path.join(RES, 'ollama-darwin', 'ollama'));
    // Legacy fallbacks.
    candidates.push(path.join(RES, 'ollama-macos'));
    candidates.push(path.join(RES, 'Ollama.app', 'Contents', 'MacOS', 'ollama'));
    candidates.push(path.join(PORTABLE_ROOT, 'ollama-darwin', 'ollama'));
  } else if (process.platform === 'win32') {
    // User-placed override first.
    candidates.push(path.join(APP_DATA_DIR, 'resources', 'ollama-windows-amd64', 'ollama.exe'));
    // Primary: v0.21.2 layout (binary + lib/ dir beside it).
    candidates.push(path.join(RES, 'ollama-windows-amd64', 'ollama.exe'));
    // Legacy flat fallbacks.
    candidates.push(path.join(RES, 'ollama.exe'));
    candidates.push(path.join(PORTABLE_ROOT, 'ollama.exe'));
  }

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { }
  }
  return null;
}

// ---------- Dynamic port scanning ----------
// Find the first TCP port in [startPort, endPort] that we can bind on 127.0.0.1.
function findFreePort(startPort = 11434, endPort = 11440) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      if (port > endPort) {
        reject(new Error(`No free port found in range ${startPort}-${endPort}`));
        return;
      }
      const server = net.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => tryPort(port + 1));
    }
    tryPort(startPort);
  });
}

// Probe a SPECIFIC port for a live Ollama server (independent of global OLLAMA_PORT).
function isOllamaUpOnPort(port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/tags', method: 'GET', timeout: timeoutMs },
      (res) => { resolve(res.statusCode === 200); }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Scan 11434–11440. If a live Ollama already answers on one, return it for reuse.
// Otherwise return the first bindable free port so we can start our own.
async function resolveOllamaPort(startPort = 11434, endPort = 11440) {
  for (let p = startPort; p <= endPort; p++) {
    if (await isOllamaUpOnPort(p, 500)) {
      return { port: p, reuse: true };
    }
  }
  const free = await findFreePort(startPort, endPort);
  return { port: free, reuse: false };
}

// ---------- Check if a server is already running (on the current OLLAMA_PORT) ----------
function isOllamaUp(timeoutMs = 700) {
  return isOllamaUpOnPort(OLLAMA_PORT, timeoutMs);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGetJSON(pathname, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: OLLAMA_PORT, path: pathname, method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function verifyModelsDirWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `.write_test_${Date.now()}`);
    fs.writeFileSync(p, 'ok');
    fs.unlinkSync(p);
    logLine(`[PortableAI] Models dir writable: ${dir}`);
    return true;
  } catch (e) {
    logLine(`[PortableAI] MODELS_DIR NOT WRITABLE: ${e.message}`);
    return false;
  }
}

async function probeOllama() {
  try {
    const tags = await httpGetJSON('/api/tags');
    const n = Array.isArray(tags?.models) ? tags.models.length : 0;
    logLine(`[PortableAI] /api/tags returned ${n} models.`);
  } catch (e) {
    logLine(`[PortableAI] probeOllama error: ${e.message}`);
  }
}

function normalizeModelsLayout(base) {
  // Ensure layout is <base>/models/{blobs,manifests}. If user copied flat folders, migrate once.
  const hasModels = fs.existsSync(path.join(base, 'models'));
  const rootBlobs = path.join(base, 'blobs');
  const rootMani = path.join(base, 'manifests');
  try {
    if (!hasModels && (fs.existsSync(rootBlobs) || fs.existsSync(rootMani))) {
      const modelsDir = path.join(base, 'models');
      fs.mkdirSync(modelsDir, { recursive: true });
      if (fs.existsSync(rootBlobs)) {
        fs.renameSync(rootBlobs, path.join(modelsDir, 'blobs'));
        logLine('[PortableAI] Migrated models layout: moved root "blobs" into models/blobs');
      }
      if (fs.existsSync(rootMani)) {
        fs.renameSync(rootMani, path.join(modelsDir, 'manifests'));
        logLine('[PortableAI] Migrated models layout: moved root "manifests" into models/manifests');
      }
    }
  } catch (e) {
    logLine(`[PortableAI] normalizeModelsLayout error: ${e.message}`);
  }
  return base; // OLLAMA_MODELS should always be the parent that contains 'models'
}

// Global reference to the child process
let ollamaChild = null;

async function stopEmbeddedOllama() {
  // Always drop runtime.json — even if we never spawned (reuse case), a stale file is worse than none.
  try { fs.unlinkSync(RUNTIME_FILE); } catch { }

  if (!ollamaChild) return;

  logLine('[PortableAI] Stopping embedded Ollama...');
  const child = ollamaChild;
  ollamaChild = null;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    child.on('exit', done);

    if (process.platform === 'win32') {
      // SIGTERM is a no-op on Windows; taskkill /T /F kills the whole process tree.
      childProcess.exec(`taskkill /F /T /PID ${child.pid}`, () => { });
      setTimeout(done, 5000); // failsafe
    } else {
      // Graceful first: SIGTERM. If it hasn't exited within 4s, escalate to SIGKILL.
      try { child.kill('SIGTERM'); } catch { }
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { }
        logLine('[PortableAI] Ollama did not exit on SIGTERM — sent SIGKILL.');
      }, 4000);
      const overall = setTimeout(done, 6000); // absolute failsafe
      child.on('exit', () => { clearTimeout(killTimer); clearTimeout(overall); });
    }
  });
}

// ---------- Start embedded server if needed ----------
async function ensureEmbeddedOllama(customModelsPath = null) {
  await stopEmbeddedOllama(); // Stop any instance WE previously started.

  // ---- Port resolution: reuse a live Ollama if one is already up, else pick a free port ----
  try {
    const { port, reuse } = await resolveOllamaPort(11434, 11440);
    OLLAMA_PORT = port;
    if (reuse) {
      // Something (a system Ollama, or a previous PortableAI that outlived us) is already
      // serving on this port. Reuse it instead of fighting for the port — just point the UI at it.
      logLine(`[PortableAI] Reusing already-running Ollama on port ${OLLAMA_PORT}.`);
      writeRuntimeFile(0, customModelsPath || DEFAULT_MODELS_DIR); // pid 0 = not ours
      if (win) {
        win.webContents.executeJavaScript(`window.__OLLAMA_PORT = ${OLLAMA_PORT}`).catch(() => { });
      }
      return;
    }
    logLine(`[PortableAI] Selected free port: ${OLLAMA_PORT}`);
  } catch (e) {
    logLine(`[PortableAI] Port scan failed (${e.message}); no free port in 11434-11440.`);
    throw new Error('No free port available in range 11434-11440. Close other Ollama instances and retry.');
  }

  const bin = findOllamaBin();
  if (!bin) {
    logLine(`[PortableAI] Ollama binary not found — expecting external/system Ollama.`);
    return;
  }

  // macOS Gatekeeper + exec-bit fix. exFAT does not persist Unix exec bits, and macOS
  // quarantines every file copied to an external drive, so we ALWAYS re-apply both before
  // launch. Each step is wrapped so it is a harmless no-op on Windows / non-quarantined files.
  if (process.platform !== 'win32') {
    const binDir = path.dirname(bin);
    try { fs.chmodSync(bin, 0o755); } catch (e) { logLine(`[PortableAI] chmod +x failed: ${e.message}`); }
    try {
      // Strip quarantine from the entire binary directory (covers companion .dylib files
      // and mlx_metal_v3/v4 subdirs). Without this Ollama silently fails to load its dylibs.
      childProcess.execFileSync('xattr', ['-rd', 'com.apple.quarantine', binDir], { stdio: 'ignore' });
      logLine(`[PortableAI] Removed com.apple.quarantine from: ${binDir}`);
    } catch { /* xattr missing or nothing quarantined — fine */ }
  }

  logLine(`[PortableAI] Starting embedded Ollama: ${bin}`);

  // Determine models directory
  const MODELS_DIR = customModelsPath || DEFAULT_MODELS_DIR;

  // Check if user selected a root that HAS a 'models' subdir (e.g. they picked ~/.ollama)
  // or if they picked the 'models' dir itself.
  let EFFECTIVE_MODELS_DIR = MODELS_DIR;

  if (fs.existsSync(path.join(MODELS_DIR, 'models', 'blobs'))) {
    // They picked a parent folder (like ~/.ollama)
    EFFECTIVE_MODELS_DIR = path.join(MODELS_DIR, 'models');
  } else if (fs.existsSync(path.join(MODELS_DIR, 'blobs'))) {
    // They picked the models folder itself
    EFFECTIVE_MODELS_DIR = MODELS_DIR;
  } else {
    // Empty or new folder? Default to using it directly.
    // But wait, if we want to be compatible with standard ~/.ollama structure,
    // maybe we should append 'models' if it's a fresh folder?
    // For PortableAI, let's keep it simple: The folder YOU PICK is where 'blobs' go.
    EFFECTIVE_MODELS_DIR = MODELS_DIR;
  }

  logLine(`[PortableAI] MODELS_DIR (User): ${MODELS_DIR}`);
  logLine(`[PortableAI] OLLAMA_MODELS (Env): ${EFFECTIVE_MODELS_DIR}`);

  try {
    // Check for content just for logging
    const mani = path.join(EFFECTIVE_MODELS_DIR, 'manifests');
    const blob = path.join(EFFECTIVE_MODELS_DIR, 'blobs');
    const maniCount = fs.existsSync(mani) ? fs.readdirSync(mani).length : 0;
    const blobCount = fs.existsSync(blob) ? fs.readdirSync(blob).length : 0;
    logLine(`[PortableAI] Found ${maniCount} manifests and ${blobCount} blobs in ${EFFECTIVE_MODELS_DIR}`);
  } catch (e) {
    logLine(`[PortableAI] count manifests/blobs error: ${e.message}`);
  }

  try {
    // Ensure models dir is writable (installs require write); log if not
    verifyModelsDirWritable(EFFECTIVE_MODELS_DIR);

    // Start from a COPY of the parent env, then strip anything that would force CPU-only
    // inference. These vars are the usual culprits behind "my GPU is ignored" reports
    // (e.g. the user's RTX 5070). We never SET them; we defensively REMOVE them in case the
    // host shell or a previous session exported them.
    const env = { ...process.env };
    for (const k of ['OLLAMA_NO_GPU', 'CUDA_VISIBLE_DEVICES', 'HIP_VISIBLE_DEVICES',
      'OLLAMA_LLM_LIBRARY', 'GGML_METAL', 'OLLAMA_NUM_GPU']) {
      if (k in env) {
        logLine(`[PortableAI] Removing CPU-forcing env var from child: ${k}=${env[k]}`);
        delete env[k];
      }
    }

    // The three vars Ollama actually needs from us.
    env.OLLAMA_HOST = `127.0.0.1:${OLLAMA_PORT}`;
    env.OLLAMA_MODELS = EFFECTIVE_MODELS_DIR; // keeps model blobs on the stick, not the OS drive
    env.OLLAMA_KEEP_ALIVE = '-1';             // keep models resident until app exit
    env.OLLAMA_ORIGINS = '*';                 // allow file:// / localhost renderer to call the API

    const binDir = path.dirname(bin);
    // Ensure companion GPU/accel libraries resolve. We ALSO set cwd to binDir on spawn so
    // relative lib lookups (CUDA on Windows, Metal on macOS) find lib/ sitting beside the exe.
    if (process.platform === 'darwin') {
      env.DYLD_LIBRARY_PATH = `${binDir}${env.DYLD_LIBRARY_PATH ? ':' + env.DYLD_LIBRARY_PATH : ''}`;
    } else if (process.platform === 'win32') {
      // v0.21.2 Windows layout: lib/ollama/ holds ggml-*.dll + cuda_v12/cuda_v13/vulkan backends.
      // Prepend it (and binDir) to PATH so the CUDA/Vulkan DLLs load from the stick.
      const libDir = path.join(binDir, 'lib', 'ollama');
      env.PATH = `${binDir};${libDir};${env.PATH || ''}`;
    }

    const args = ['serve'];
    ollamaChild = childProcess.spawn(bin, args, {
      env,
      cwd: binDir,                              // critical: lets CUDA/Metal libs resolve beside the binary
      detached: process.platform !== 'win32',  // Windows: keep in same process group so kill() works
      stdio: ['ignore', 'pipe', 'pipe'],        // capture logs
      windowsHide: true,
    });

    const append = (buf) => { try { fs.appendFileSync(LOG_FILE, buf.toString()); } catch { } };
    if (ollamaChild.stdout) ollamaChild.stdout.on('data', append);
    if (ollamaChild.stderr) ollamaChild.stderr.on('data', append);

    // Prevent crash if spawn fails immediately
    ollamaChild.on('error', (err) => {
      logLine(`[PortableAI] Spawn error: ${err.message}`);
    });

    ollamaChild.unref();
    logLine(`[PortableAI] Launched embedded Ollama (serve) on port ${OLLAMA_PORT}.`);

    // Inject the dynamic port so the renderer knows which port Ollama is on
    if (win) {
      win.webContents.executeJavaScript(`window.__OLLAMA_PORT = ${OLLAMA_PORT}`).catch(() => { });
    }

    await sleep(3000); // Give Ollama more time on slow USB drives
    const ok = await isOllamaUp(800);
    logLine(ok ? `[PortableAI] Embedded Ollama is up on ${OLLAMA_PORT}.` : `[PortableAI] Embedded Ollama did not respond on ${OLLAMA_PORT}.`);

    // Write runtime.json { port, pid, os, arch, timestamp, ... }
    writeRuntimeFile(ollamaChild ? ollamaChild.pid : 0, EFFECTIVE_MODELS_DIR);

    await probeOllama();
    try {
      const v = await httpGetJSON('/api/version');
      logLine(`[PortableAI] ollama version: ${v?.version || 'unknown'}`);
    } catch (e) {
      logLine(`[PortableAI] /api/version error: ${e.message}`);
    }

    // Preload the default model into RAM with keep_alive=-1 (fire and forget).
    // Preference order: settings.json default_model (if installed) → first installed model.
    try {
      const tags = await httpGetJSON('/api/tags').catch(() => ({ models: [] }));
      const models = tags.models || [];
      if (models.length > 0) {
        const settings = loadSettings();
        const wanted = settings.default_model || settings.model || '';
        const installedNames = models.map(m => m.name);
        // Accept exact match, or a name that matches ignoring an implicit ":latest" tag.
        const matched = installedNames.find(n =>
          n === wanted || n === `${wanted}:latest` || n.split(':')[0] === wanted);
        const modelName = matched || models[0].name;
        logLine(`[PortableAI] Preloading model into RAM (keep_alive=-1): ${modelName}`
          + (wanted ? ` (settings default_model="${wanted}")` : ''));
        const postData = JSON.stringify({ model: modelName, keep_alive: -1, prompt: '' });
        const preloadReq = http.request({
          host: '127.0.0.1',
          port: OLLAMA_PORT,
          path: '/api/generate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        });
        preloadReq.on('error', (e) => logLine(`[PortableAI] Preload request error: ${e.message}`));
        preloadReq.write(postData);
        preloadReq.end();
        // Don't await — model loads in background while user sees the UI
      } else {
        logLine('[PortableAI] No models found to preload.');
      }
    } catch (e) {
      logLine(`[PortableAI] Model preload error: ${e.message}`);
    }

    // If API shows 0 models but we counted some on disk, hint that an external server might still be serving
    try {
      const maniDir = path.join(EFFECTIVE_MODELS_DIR, 'manifests');
      const blobDir = path.join(EFFECTIVE_MODELS_DIR, 'blobs');
      const maniCount = fs.existsSync(maniDir) ? fs.readdirSync(maniDir).length : 0;
      const blobCount = fs.existsSync(blobDir) ? fs.readdirSync(blobDir).length : 0;
      const tags = await httpGetJSON('/api/tags').catch(() => ({ models: [] }));
      const n = Array.isArray(tags.models) ? tags.models.length : 0;
      if ((maniCount > 0 || blobCount > 0) && n === 0) {
        logLine('[PortableAI] Detected manifests/blobs on disk but /api/tags is empty — likely still connected to a system Ollama.');
      }
    } catch (_) { }

  } catch (e) {
    logLine(`[PortableAI] Failed to start embedded Ollama: ${e.message}`);
  }
}

// ---------- App Lifecycle ----------
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      preload: path.join(app.isPackaged ? app.getAppPath() : __dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'PortableAi',
  });

  // Load the local index.html (works in dev + packaged)
  const baseDir = app.isPackaged ? app.getAppPath() : __dirname;
  const candidates = [
    path.join(baseDir, 'webui', 'index.html'),
    path.join(baseDir, 'index.html'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    const msg = `UI index.html not found. Looked for:\n- ${candidates[0]}\n- ${candidates[1]}`;
    logLine(`[PortableAI] ${msg}`);
    dialog.showErrorBox('PortableAI', msg);
    return;
  }
  logLine(`[PortableAI] Loading UI from: ${found}`);
  win.loadFile(found);

  if (process.env.OPEN_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('did-finish-load', () => {
    logLine('[PortableAI] Renderer did-finish-load');
    // Inject the dynamic port so the renderer knows which port Ollama is on
    win.webContents.executeJavaScript(`window.__OLLAMA_PORT = ${OLLAMA_PORT}`);
  });

  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc) => {
    logLine(`[PortableAI] did-fail-load ${errorCode} ${errorDesc}`);
    dialog.showErrorBox('PortableAI — UI failed to load', `${errorDesc} (code ${errorCode})`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    logLine(`[PortableAI] Renderer process gone: ${details.reason} (exitCode=${details.exitCode})`);
  });
}

// ---------- IPC convenience ----------
// IPC: Get Ollama Port
ipcMain.handle('get-port', () => OLLAMA_PORT);

// IPC: Get Runtime info (runtime.json contents: port, pid, os, arch, timestamp).
// Handy for the renderer's status bar. Falls back to a live object if the file is absent.
ipcMain.handle('get-runtime', () => {
  try {
    if (fs.existsSync(RUNTIME_FILE)) {
      return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    }
  } catch (e) {
    logLine(`[PortableAI] get-runtime read error: ${e.message}`);
  }
  return { port: OLLAMA_PORT, pid: ollamaChild ? ollamaChild.pid : 0, os: process.platform, arch: process.arch };
});

// IPC: Get System Info (for setup flow hardware detection)
ipcMain.handle('get-system-info', () => {
  const os = require('os');
  return {
    totalRAM: Math.round(os.totalmem() / (1024 ** 3)),
    platform: process.platform,
    arch: process.arch
  };
});

// IPC: Get Drive Space (for model store)
ipcMain.handle('get-drive-space', async () => {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      const df = childProcess.execSync(`df -k "${PORTABLE_ROOT}"`).toString();
      const lines = df.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const totalKB = parseInt(parts[1]) || 0;
        const usedKB = parseInt(parts[2]) || 0;
        const freeKB = parseInt(parts[3]) || 0;
        return { total: totalKB * 1024, used: usedKB * 1024, free: freeKB * 1024 };
      }
    } else if (process.platform === 'win32') {
      const drive = PORTABLE_ROOT.charAt(0) + ':';
      // Use PowerShell Get-CimInstance instead of deprecated wmic (removed in Win11)
      const ps = childProcess.execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='${drive}'\") | Select-Object -Property Size,FreeSpace | ConvertTo-Json"`,
        { encoding: 'utf8' }
      );
      const info = JSON.parse(ps.trim());
      const total = parseInt(info.Size) || 0;
      const free = parseInt(info.FreeSpace) || 0;
      return { total, used: total - free, free };
    }
  } catch (e) {
    logLine(`[PortableAI] get-drive-space error: ${e.message}`);
  }
  return null;
});

// IPC: Get Settings from config/settings.json (returns {} if none — never null,
// so the renderer can spread it safely).
ipcMain.handle('get-settings', async () => loadSettings());

// IPC: Save Settings to config/settings.json. Accepts either a full settings object
// (replace) or a partial patch — we always merge onto the existing file so the UI can
// save one field without clobbering the rest. Returns true/false.
ipcMain.handle('save-settings', async (_event, settings) => {
  if (!settings || typeof settings !== 'object') return false;
  const merged = { ...loadSettings(), ...settings };
  const ok = saveSettings(merged);
  if (ok) logLine('[PortableAI] Saved settings.json');
  return ok;
});

// IPC: Open Models Directory
ipcMain.handle('open-models-dir', async () => {
  const cfg = loadConfig();
  const dir = cfg.customModelsPath || DEFAULT_MODELS_DIR;
  const err = await shell.openPath(dir);
  if (err) logLine(`[PortableAI] open-models-dir OS error: ${err}`);
  logLine(`[PortableAI] Opened models dir: ${dir}`);
  return dir;
});

// IPC: Get Config
ipcMain.handle('get-config', async () => {
  const cfg = loadConfig();
  return {
    customModelsPath: cfg.customModelsPath || null,
    defaultModelsPath: DEFAULT_MODELS_DIR,
    currentModelsPath: cfg.customModelsPath || DEFAULT_MODELS_DIR
  };
});

// IPC: Pick Models Directory
ipcMain.handle('pick-models-dir', async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Folder for Ollama Models'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC: Pick Migration Destination Directory
ipcMain.handle('pick-migration-dir', async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Destination Drive or Folder for PortableAi Migration',
    message: 'Select the empty folder or root drive where you want to move the entire PortableAI application.'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC: Execute App Migration
ipcMain.handle('execute-migration', async (event, destPath) => {
  if (!destPath) throw new Error('No destination path provided.');

  const sendProgress = (phase, detail = '') => {
    if (win) win.webContents.send('migration-progress', { phase, detail });
    logLine(`[PortableAI] Migration: ${phase}${detail ? ' — ' + detail : ''}`);
  };

  try {
    logLine(`[PortableAI] Migration requested to: ${destPath}`);
    sendProgress('Stopping Ollama…');
    // 1. Stop Ollama to release locks on all local model blob files
    await stopEmbeddedOllama();

    // 2. Determine target folder name to safely nest the output
    const folderName = path.basename(PORTABLE_ROOT);
    const targetPath = path.join(destPath, folderName);

    logLine(`[PortableAI] Copying application from ${PORTABLE_ROOT} to ${targetPath}...`);

    // Directories to skip — node_modules and .git can be hundreds of MB of tiny files
    // that cause the copy to appear frozen for many minutes. They are not needed on the
    // portable drive (npm install can regenerate node_modules, and .git is dev-only).
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.cache']);

    // 3. Copy models first so the user sees something meaningful immediately
    sendProgress('Copying models…');
    const modelsSource = DEFAULT_MODELS_DIR;
    const modelsDest = path.join(targetPath, 'app_data', 'models');
    process.noAsar = true;
    try {
      if (fs.existsSync(modelsSource)) {
        await fse.copy(modelsSource, modelsDest, { overwrite: true });
      }

      // 4. Copy the rest of the app, skipping heavy dev-only directories
      sendProgress('Copying app files…');
      await fse.copy(PORTABLE_ROOT, targetPath, {
        overwrite: true,
        errorOnExist: false,
        filter: (src) => {
          if (src === LOG_FILE) return false;
          if (src === RUNTIME_FILE) return false;
          // Skip heavy directories that are not needed on the portable drive
          const base = path.basename(src);
          if (SKIP_DIRS.has(base)) {
            logLine(`[PortableAI] Migration: skipping ${src}`);
            return false;
          }
          return true;
        }
      });
    } finally {
      process.noAsar = false;
    }

    sendProgress('Done!');
    logLine(`[PortableAI] Migration successful! Copied to ${targetPath}`);
    return { success: true, targetPath };
  } catch (err) {
    logLine(`[PortableAI] Migration failed: ${err.message}`);
    sendProgress('Failed — restoring Ollama…');
    // If we fail, immediately spin Ollama back up so the app remains perfectly usable
    const cfg = loadConfig();
    const startPath = cfg.customModelsPath || DEFAULT_MODELS_DIR;
    await ensureEmbeddedOllama(startPath);
    return { success: false, error: err.message };
  }
});

// IPC: Set Models Directory
ipcMain.handle('set-models-dir', async (event, dirPath) => {
  const config = loadConfig();
  // If null, reset to default
  if (!dirPath) {
    logLine(`[PortableAI] User changing models dir to: DEFAULT`);
    delete config.customModelsPath;
  } else {
    logLine(`[PortableAI] User changing models dir to: ${dirPath} `);
    // v1.1 Polish: Ensure directory exists
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create custom model dir:', err);
      throw new Error('Could not create directory');
    }
    config.customModelsPath = dirPath;
  }
  saveConfig(config);

  // Restart Ollama with new path
  const effectivePath = dirPath || DEFAULT_MODELS_DIR;
  try {
    await ensureEmbeddedOllama(effectivePath);
  } catch (e) {
    logLine(`[PortableAI] Error restarting Ollama after dir change: ${e.message}`);
    // We don't throw here to avoid crashing the renderer IPC, but we log it.
    // The UI might show "Checking..." forever if it fails, but at least app stays alive.
  }
  return true;
});

// IPC: Cache & Move Install Strategy
let isCacheMode = false;
const CACHE_DIR = path.join(app.getPath('temp'), 'portableai_install_cache');

ipcMain.handle('prepare-cache-install', async () => {
  logLine('[PortableAI] Preparing cache install...');
  isCacheMode = true;
  try {
    await fse.ensureDir(CACHE_DIR);
    // Restart Ollama pointing to CACHE_DIR
    await ensureEmbeddedOllama(CACHE_DIR);
    return true;
  } catch (e) {
    logLine(`[PortableAI] Prepare cache failed: ${e.message}`);
    isCacheMode = false;
    throw e;
  }
});

ipcMain.handle('finish-cache-install', async () => {
  if (!isCacheMode) return;
  isCacheMode = false; // Immediately unset the lock to prevent IPC re-entrancy
  logLine('[PortableAI] Finishing cache install (moving files)...');

  try {
    // 1. Stop Ollama so we can move files
    await stopEmbeddedOllama();

    // 2. Move blobs/manifests to real destination
    const cfg = loadConfig();
    const dest = cfg.customModelsPath || DEFAULT_MODELS_DIR;

    // Determine source blobs/manifests location
    // Ollama might create them in CACHE_DIR/blobs or CACHE_DIR/models/blobs
    let srcBlobs = path.join(CACHE_DIR, 'blobs');
    let srcManifests = path.join(CACHE_DIR, 'manifests');

    if (!await fse.pathExists(srcBlobs)) {
      // Try 'models' subdir
      const altBlobs = path.join(CACHE_DIR, 'models', 'blobs');
      if (await fse.pathExists(altBlobs)) {
        srcBlobs = altBlobs;
        srcManifests = path.join(CACHE_DIR, 'models', 'manifests');
      }
    }

    // Determine destination blobs/manifests location
    // We want to match the structure of the destination if possible, or default to standard
    let destBlobs = path.join(dest, 'blobs');
    let destManifests = path.join(dest, 'manifests');

    if (await fse.pathExists(path.join(dest, 'models', 'blobs'))) {
      destBlobs = path.join(dest, 'models', 'blobs');
      destManifests = path.join(dest, 'models', 'manifests');
    } else if (!await fse.pathExists(destBlobs)) {
      // If neither exists, maybe we should create 'models/blobs' to be safe/standard? 
      // Or just 'blobs' if that's what PortableAI prefers.
      // ensureEmbeddedOllama seems to prefer flat if empty.
    }

    // Helper to recursively merge-move a directory tree without replacing existing subdirs.
    // Using fse.move on a whole subdirectory (e.g. registry.ollama.ai) with overwrite:true
    // would delete all manifests for previously-installed models. Instead we recurse into
    // directories and only move individual files, so existing sibling model manifests survive.
    const mergeMoveDir = async (src, dst, label) => {
      if (!await fse.pathExists(src)) return;
      await fse.ensureDir(dst);
      const entries = await fse.readdir(src);
      for (let i = 0; i < entries.length; i++) {
        const name = entries[i];
        const srcPath = path.join(src, name);
        const dstPath = path.join(dst, name);
        const stat = await fse.stat(srcPath);

        if (stat.isDirectory()) {
          if (win) win.webContents.send('cache-move-progress', { label, index: i + 1, total: entries.length });
          await mergeMoveDir(srcPath, dstPath, label); // recurse — merge, don't replace
        } else {
          // Cross-device moves of large AI models block indefinitely. Show byte progress!
          if (stat.size > 50 * 1024 * 1024) {
            await new Promise((resolve, reject) => {
              let copied = 0;
              let lastPct = -1;
              const rs = fs.createReadStream(srcPath);
              const ws = fs.createWriteStream(dstPath);

              rs.on('data', (chunk) => {
                copied += chunk.length;
                const pct = Math.round((copied / stat.size) * 100);
                // Throttle UI updates to every 1% change
                if (pct !== lastPct) {
                  lastPct = pct;
                  if (win) win.webContents.send('cache-move-progress', { label, index: i + 1, total: entries.length, percent: pct });
                }
              });

              rs.on('error', reject);
              ws.on('error', reject);
              ws.on('finish', resolve);
              rs.pipe(ws);
            });
            // Cleanup the original file like a move does
            await fse.remove(srcPath);
          } else {
            if (win) win.webContents.send('cache-move-progress', { label, index: i + 1, total: entries.length });
            await fse.move(srcPath, dstPath, { overwrite: true }); // safe: blobs are content-addressed
          }
        }
      }
      try { await fse.remove(src); } catch { }
    };

    await mergeMoveDir(srcBlobs, destBlobs, 'blobs');
    await mergeMoveDir(srcManifests, destManifests, 'manifests');

    logLine('[PortableAI] Cache move complete.');
  } catch (e) {
    logLine(`[PortableAI] Cache move failed: ${e.message}`);
    throw e;
  } finally {
    isCacheMode = false;
    // 3. Restart Ollama pointing to real destination
    const cfg = loadConfig();
    const dest = cfg.customModelsPath || DEFAULT_MODELS_DIR;
    await ensureEmbeddedOllama(dest);
  }
  return true;
});

ipcMain.handle('restart-ollama', async () => {
  logLine('[PortableAI] Manual restart requested.');
  const cfg = loadConfig();
  const dest = cfg.customModelsPath || DEFAULT_MODELS_DIR;
  await ensureEmbeddedOllama(dest);
  return true;
});

// ---------- Check for VC++ Runtime on Windows ----------
async function checkVCRuntime() {
  if (process.platform !== 'win32') return;
  try {
    // Check for the VC++ 2015-2022 Redistributable via registry
    const regQuery = childProcess.execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" /v Installed 2>nul',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    if (regQuery.includes('0x1')) {
      logLine('[PortableAI] VC++ Runtime detected.');
      return;
    }
  } catch { /* registry key not found — runtime likely missing */ }

  logLine('[PortableAI] VC++ Runtime NOT detected — prompting user.');

  // Look for the bundled installer
  const RES = getResourcesDir();
  const vcRedistCandidates = [
    path.join(RES, 'vc_redist.x64.exe'),
    path.join(RES, 'ollama-windows-amd64', 'vc_redist.x64.exe'),
    path.join(PORTABLE_ROOT, 'resources', 'ollama-windows-amd64', 'vc_redist.x64.exe'),
  ];
  const vcRedist = vcRedistCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });

  const buttons = vcRedist ? ['Install Now', 'Skip'] : ['OK'];
  const detail = vcRedist
    ? 'The Visual C++ Runtime is required for Ollama to function correctly. Would you like to install it now?'
    : 'The Visual C++ Runtime is required for Ollama. Please download and install it from Microsoft.';

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'PortableAI — Missing Dependency',
    message: 'Visual C++ Redistributable not found',
    detail,
    buttons,
    defaultId: 0,
  });

  if (vcRedist && result.response === 0) {
    logLine(`[PortableAI] Launching VC++ installer: ${vcRedist}`);
    try {
      childProcess.execSync(`"${vcRedist}" /install /passive /norestart`, { stdio: 'ignore' });
      logLine('[PortableAI] VC++ Runtime installed successfully.');
    } catch (e) {
      logLine(`[PortableAI] VC++ installer failed: ${e.message}`);
    }
  }
}

// ---------- Write stop scripts to app_data/scripts/ if not already present ----------
function createStopScripts() {
  const scriptsDir = path.join(APP_DATA_DIR, 'scripts');

  const stopCommand = path.join(scriptsDir, 'stop.command');
  if (!fs.existsSync(stopCommand)) {
    try {
      fs.writeFileSync(stopCommand,
        '#!/bin/bash\n# PortableAI — Emergency shutdown\npkill -f "ollama" 2>/dev/null\npkill -f "PortableAI" 2>/dev/null\necho "PortableAI stopped."\n'
      );
      fs.chmodSync(stopCommand, 0o755);
      logLine('[PortableAI] Created app_data/scripts/stop.command');
    } catch (e) { logLine(`[PortableAI] Could not write stop.command: ${e.message}`); }
  }

  const stopBat = path.join(scriptsDir, 'stop.bat');
  if (!fs.existsSync(stopBat)) {
    try {
      fs.writeFileSync(stopBat,
        '@echo off\r\ntaskkill /IM ollama.exe /F 2>nul\r\ntaskkill /IM PortableAI.exe /F 2>nul\r\necho PortableAI stopped.\r\npause\r\n'
      );
      logLine('[PortableAI] Created app_data/scripts/stop.bat');
    } catch (e) { logLine(`[PortableAI] Could not write stop.bat: ${e.message}`); }
  }
}

app.whenReady().then(async () => {
  const cfg = loadConfig();
  const startPath = cfg.customModelsPath || DEFAULT_MODELS_DIR;
  logLine(`[PortableAI] App ready. Starting Ollama with models at: ${startPath}`);

  createStopScripts();
  await checkVCRuntime();
  await ensureEmbeddedOllama(startPath);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', async () => {
  await stopEmbeddedOllama();
  try { fs.unlinkSync(RUNTIME_FILE); } catch { }
});

app.on('before-quit', async () => {
  // This handler is kept for consistency, but `will-quit` is now the primary cleanup point.
  // If `will-quit` is guaranteed to fire, this might be redundant.
  // However, `before-quit` can be used to prevent quitting, which `will-quit` cannot.
  // For simple cleanup, `will-quit` is often preferred.
  // await stopEmbeddedOllama(); // Moved to will-quit
});

// Electron exits on SIGTERM/SIGINT without firing quit events, which would
// orphan the Ollama child. Route signals through app.quit() so will-quit runs.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => app.quit());
}