# Portable AI — Electron App (source)

This directory is the Electron application behind Portable AI. Full project
documentation — features, screenshots, prebuilt downloads, checksums, and
troubleshooting — lives in the [repo-root README](../../../README.md).

## Layout

- `main.js` — Electron main process: portable-root detection, embedded Ollama
  lifecycle (port scan 11434–11440), settings/runtime IPC, host-junk avoidance
  (all Electron paths + `OLLAMA_MODELS` stay on the drive)
- `preload.js` — contextIsolation bridge (`window.electron`, `window.models`);
  IPC channels documented in `scripts/IPC-CONTRACT.md`
- `webui/index.html` — the entire chat UI in one self-contained file; all JS
  inlined, zero external resources (the app is fully offline at runtime)
- `resources/ollama-darwin/`, `resources/ollama-windows-amd64/` — embedded
  Ollama runtime, NOT in git; fetched sha256-verified by the repo-root
  `setup.sh` / `setup.ps1`
- `scripts/launcher/` — Go source for the Windows root launcher exe
- `package.json` — electron-builder config: mac universal (arm64+x64) dmg/zip,
  win x64 zip with the full CUDA bundle, ad-hoc codesign via
  `scripts/afterpack-codesign.js`

## Build

```bash
# From the repo root, fetch the Ollama runtime first:
./setup.sh            # or .\setup.ps1 on Windows

cd "Code PAI and App/PAI/PortableAi_Electron_Skeleton"
npm install
npm start             # run in dev
npm run dist          # package (universal DMG/zip on Mac, zip on Windows)
```

## Constraints

- Zero network calls at runtime — no CDNs, no telemetry; the only network use
  is user-triggered model downloads / catalog refresh
- Target file system is exFAT: no symlinks, no Unix permissions
  (`main.js` re-applies `chmod +x` before exec on macOS)
- All paths must work on Mac and Windows, and may contain spaces

## License

Copyright (C) 2024-2026 Sammuel Oluwaseyi Johnson.
Licensed under the GNU Affero General Public License v3.0 only
(AGPL-3.0-only). See [LICENSE](LICENSE) for the full text.
