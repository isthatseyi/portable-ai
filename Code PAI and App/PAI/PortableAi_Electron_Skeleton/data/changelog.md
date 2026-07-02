# PortableAI Changelog

## 2026-03-23 — Code Review: main.js & preload.js

### Bugs Fixed

1. **Inline `require('net')` in `findFreePort()`** — `require('net')` was called inside a recursive closure on every port retry. Hoisted to top-level imports alongside `http`, `fs`, etc.

2. **Unused imports removed** — `pathToFileURL` (from `'url'`) and `isDev` (`!app.isPackaged`) were declared but never referenced. Removed both to reduce dead code.

3. **Shell injection risk in xattr call** — `execSync` with a template-literal command string could break if the binary path contained shell metacharacters (possible on exFAT volumes). Replaced with `execFileSync('xattr', ['-rd', 'com.apple.quarantine', bin])` which bypasses the shell entirely.

4. **Missing space in startup log** — `"App ready.Starting Ollama"` → `"App ready. Starting Ollama"`.

5. **Open IPC channel in preload.js** — The generic `invoke(channel, ...args)` function let the renderer call *any* `ipcMain.handle` by name, which is a well-known Electron security anti-pattern. Added an `ALLOWED_CHANNELS` allowlist; unknown channels now reject with an error.

### Reviewed But Not Changed

- **`findFreePort` TOCTOU gap** — Port could theoretically be grabbed between the test-server close and Ollama bind. Acceptable risk for a USB-portable app with a narrow port range.
- **Duplicate `RUNTIME_FILE` unlink** — Deleted in both `stopEmbeddedOllama()` and `will-quit`. Redundant but harmless (second call caught by try/catch).
- **`httpGetJSON` on non-200 responses** — Parses body as JSON regardless of status code. Fine for Ollama which always returns JSON.
- **`normalizeModelsLayout()` defined but never called** — Kept as-is since it exists for a future migration path.
