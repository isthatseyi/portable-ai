# PortableAI — IPC Contract (main ↔ renderer)

This is the stable bridge between `main.js` (Electron main process) and the WebUI
(`webui/index.html` / `webui/app.js`). The renderer has `nodeIntegration: false` and
`contextIsolation: true`, so it can ONLY talk to main through the objects exposed in
`preload.js`. Do not add `require()` in the renderer — go through these bridges.

Owned by the main-process agent. If you (UI agent) need a new channel, request it here
so the channel name + payload stay aligned on both sides.

---

## Bridges exposed on `window`

`preload.js` exposes three globals:

### `window.electron`
Generic, allow-listed IPC plus named convenience methods.

| Method | Returns | Notes |
|---|---|---|
| `electron.invoke(channel, ...args)` | `Promise<any>` | Generic invoke; rejects if `channel` is not in the allow-list below. |
| `electron.on(channel, cb)` | — | Subscribe to a main→renderer event. Only `cache-move-progress`, `migration-progress` are allowed. |
| `electron.getPort()` | `Promise<number>` | Current Ollama port (11434–11440). |
| `electron.getRuntime()` | `Promise<object>` | Contents of `runtime.json` — `{ port, pid, os, arch, timestamp, model_dir, version }`. |
| `electron.getSettings()` | `Promise<object>` | Parsed `config/settings.json`. Returns `{}` (never `null`) if the file is missing. |
| `electron.saveSettings(obj)` | `Promise<boolean>` | **Merges** `obj` onto existing settings then writes. Pass a partial patch to update one field. |
| `electron.restartOllama()` | `Promise<boolean>` | Restart the embedded server (re-scans port, reloads default model). |
| `electron.getSystemInfo()` | `Promise<{totalRAM, platform, arch}>` | RAM in GB. |
| `electron.getDriveSpace()` | `Promise<{total, used, free}\|null>` | Bytes on the portable drive. |

### `window.models`
Model-directory management.

| Method | Returns | Notes |
|---|---|---|
| `models.openDir()` | `Promise<string>` | Opens the models folder in Finder/Explorer; returns the path. |
| `models.getConfig()` | `Promise<{customModelsPath, defaultModelsPath, currentModelsPath}>` | |
| `models.pickDir()` | `Promise<string\|null>` | Folder picker; `null` if cancelled. |
| `models.setDir(path)` | `Promise<true>` | Set models dir (`null` resets to default) and restart Ollama. |

### `window.runtime`
Reserved placeholder (currently empty). Do not depend on it.

### `window.__OLLAMA_PORT`
A number injected into the page after load and whenever the port changes. Use it as a
synchronous hint for the fetch base URL: `http://127.0.0.1:${window.__OLLAMA_PORT}`.
Prefer `await window.electron.getPort()` when you need a guaranteed-fresh value.

---

## Allow-listed `invoke` channels

`get-port`, `get-runtime`, `get-settings`, `save-settings`, `open-models-dir`,
`get-config`, `pick-models-dir`, `set-models-dir`, `restart-ollama`,
`prepare-cache-install`, `finish-cache-install`, `pick-migration-dir`,
`execute-migration`, `get-system-info`, `get-drive-space`.

## Allow-listed event channels (main → renderer, via `electron.on`)

`cache-move-progress` — `{ label, index, total, percent? }`
`migration-progress`  — `{ phase, detail }`

---

## Talking to Ollama directly (HTTP)

The renderer calls the Ollama REST API directly over HTTP (not IPC). The server runs at
`http://127.0.0.1:<port>` and is started with `OLLAMA_ORIGINS=*`, so cross-origin fetch
from the `file://` renderer is allowed. Resolve the port with `getPort()` /
`window.__OLLAMA_PORT`. Streaming endpoints (`/api/chat`, `/api/generate`) return
newline-delimited JSON — split on `\n` and parse each line.

---

## Changes in this session (main-process work)

- Added `get-runtime` channel + `electron.getRuntime()`.
- `get-settings` now returns `{}` instead of `null` when the file is absent.
- `save-settings` now **merges** the patch onto the existing file (was full-replace);
  a single-field save no longer wipes the rest of settings.
- Ollama port is now chosen dynamically from 11434–11440, and an already-running Ollama
  in that range is reused (in which case `runtime.json` reports `pid: 0`).
- `config/settings.json` key `default_model` (falls back to `model`) is used to pick
  which model gets preloaded into RAM with `keep_alive=-1`.

## Changes (July 2026 session)

- Added `get-model-catalog` → returns the cached `app_data/config/model-catalog.json`
  (`{fetchedAt, source, models:[{name,size,modified_at}]}`) or `null` if never fetched.
- Added `refresh-model-catalog` → main process fetches `https://ollama.com/api/tags`
  (pinned domain, 15s timeout, strict schema validation), writes the cache, returns
  `{ok:true, catalog}` or `{ok:false, error}`. Only invoked on explicit user action
  from the Model Store ("Check ollama.com"); the renderer itself makes no external
  network calls.
- Exposed as `electron.getModelCatalog()` / `electron.refreshModelCatalog()`.
- Note: the Electron app starts Ollama with a RESTRICTED `OLLAMA_ORIGINS` list
  (file://, app://, localhost) — the `OLLAMA_ORIGINS=*` mention above applies to the
  browser-fallback launchers only.
