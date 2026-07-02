# Portable AI — Electron-Based Cross-Platform Local LLM App

## Project Overview
Cross-platform portable AI application packaged as an Electron app. Runs from a USB drive on Mac and Windows. User double-clicks the app, gets a native window with a local LLM chat interface powered by Ollama. Zero internet required at runtime. All data stays on the USB drive.

## Architecture (DO NOT CHANGE THIS)
This is an Electron application. Active codebase: `Code PAI and App/PAI/PortableAi_Electron_Skeleton/`
- `main.js` — Electron main process: embedded Ollama lifecycle, port scan 11434–11440, settings/runtime IPC, portable-root detection, host-junk avoidance (all Electron paths + OLLAMA_MODELS on the stick)
- `preload.js` — contextIsolation bridge (`window.electron`, `window.models`); channels documented in `scripts/IPC-CONTRACT.md`
- `webui/index.html` — the ENTIRE chat UI, single self-contained file, all JS inlined, zero external resources
- `resources/ollama-darwin/` + `resources/ollama-windows-amd64/` — embedded Ollama v0.21.2 (NOT in git; fetched by root `setup.sh` / `setup.ps1`). Note: the `.so` files in the darwin bundle are official ggml CPU backends — they belong there.
- `package.json` — electron-builder: mac universal (arm64+x64) dmg/zip, win x64 zip with full CUDA libs, ad-hoc codesign via `scripts/afterpack-codesign.js`
- `scripts/launcher/` — Go source for the Windows root launcher exe
- USB root: `MacTerminal.command` + `Windows.bat` — no-Electron fallback launchers (browser UI)

## Status (July 2026 session)
DONE: UI Priority-1 list (inline JS, IndexedDB conversations, copy buttons, status bar, loading overlay, smart auto-scroll, auto-resize textarea, .md export, token stats, NDJSON parser hardening); Windows.bat full rewrite; binary consolidation (one copy in resources/, v0.21.2); config/settings.json + runtime.json IPC; Gatekeeper fix; model preload keep_alive=-1; clean shutdown; GPU fixes (spawn cwd beside lib/, no CPU-forcing env, full CUDA bundle packaged — fixes RTX 50-series); host-junk fixes; electron-builder mac universal + win; repo restructured source-only with setup.sh/setup.ps1.

## Remaining / Future Features
- [ ] Verify a packaged Windows build on real Windows hardware (developer is Mac-only — keep Windows scripts defensive and commented)
- [ ] Prompt library (JSON file with 50+ starter prompts on welcome screen)
- [ ] Conversation search across saved conversations
- [ ] Document upload for RAG (drag-drop PDF/TXT)
- [ ] Multiple bundled models (small fast + large capable)
- [ ] Local WiFi mobile access (QR code connects phone browser to laptop AI)
- [ ] Voice input via Web Speech API
- [ ] Export all conversations as zip
- [ ] Windows code signing (DigiCert); Mac Developer ID signing + notarization

## Technical Constraints
- ZERO external network calls at runtime. Everything offline. No CDNs in the UI.
- Repo is SOURCE-ONLY: never commit binaries, models, `Build releases/`, or anything >100MB. Ollama runtimes are reconstructed by `setup.sh` / `setup.ps1` (sha256-pinned).
- exFAT file system: no symlinks (dereference when copying bundles), no Unix permissions (always `chmod +x` before exec on Mac), no journaling
- All file paths must work on both Mac and Windows (paths contain spaces — always quote)
- Target total USB size: 8–16GB. Minimum hardware: 8GB RAM, USB 3.0
