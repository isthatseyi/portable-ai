# Portable AI

A cross-platform portable LLM app. Download a model once, then run anywhere with no internet.

![Chat](screenshots/chat-response-dark.png)

## What This Is

An Electron app that bundles [Ollama](https://ollama.com) on a single exFAT-formatted USB drive. Plug it into any Mac or Windows machine, double-click, and chat with a local LLM. No installation on the host computer. No cloud. No accounts.

The same physical drive works on both operating systems.

This repository is **source-only**: the multi-gigabyte Ollama runtime and models are not in git. After cloning, `setup.sh` / `setup.ps1` downloads the official Ollama release (sha256-verified) and drops it in place.

## Why

Every portable AI tool is locked to one platform. [OffGrid AI](https://www.offgridai.app/) is Windows-only and costs $129–$469. Products like [Vision1 Mini](https://vision1.ai/) and [Docket Mini](https://docket.ai/) are hardware-locked to a single OS. This project works on Mac *and* Windows from the same drive.

## Features

- **Streaming chat** — real-time token-by-token rendering via Ollama's API, with per-message token count and tokens/sec
- **Single-file UI** — the entire chat interface is one self-contained `index.html`; zero CDN or network dependencies
- **Conversation history** — IndexedDB-backed storage with new/rename/delete, sorted by recent activity, survives cache clears
- **Markdown rendering** — headings, bold/italic, lists, blockquotes, tables, inline code
- **Code syntax highlighting** — with a copy button on every code block
- **Status bar** — live server dot, active model, last-response tokens/sec, and port
- **Dark and light themes + 6 accent colors** — persisted across sessions
- **Model selector & Model Store** — switch models mid-session; built-in browser for downloading models filtered by RAM tier, with progress and drive-space indicator
- **Settings panel** — General, Chat & Generation, Models, Behavior & Personality, Memory, Model Overrides
- **Temperature & context length controls** — Precise / Balanced / Creative presets; 2048–16384 token context
- **Personalization & memory** — system instructions, style/tone presets, opt-in cross-conversation memory with management UI
- **First-run setup wizard** — hardware detection, model recommendation by RAM, guided download
- **Full app migration** — copy the entire app (executables + models) to a new drive from within the UI
- **Dynamic port scanning** — finds a free port in 11434–11440, or reuses an already-running Ollama
- **Embedded Ollama lifecycle** — auto-start on launch, auto-stop on quit, macOS quarantine/Gatekeeper handling
- **GPU acceleration** — full CUDA bundle on Windows (including RTX 50-series/Blackwell), Metal/MLX on Mac
- **No junk on the host** — models, Electron caches, and app data all live on the drive (`OLLAMA_MODELS` + relocated `userData`)
- **Export conversation as Markdown**, smart auto-scroll with "↓ New messages", auto-resizing input, keyboard shortcuts (`Cmd/Ctrl+B` sidebar, `Cmd/Ctrl+K` new chat, `Enter` send, `Shift+Enter` newline)
- **Fallback launchers** — `MacTerminal.command` and `Windows.bat` run Ollama + the UI in a plain browser, no Electron required

## Screenshots

| Dark Mode | Light Mode |
|-----------|------------|
| ![Dark mode](screenshots/chat-response-dark.png) | ![Light mode](screenshots/chat-response-light.png) |

| Settings (Chat & Generation) | Settings (Personality) |
|------------------------------|------------------------|
| ![Settings](screenshots/settings-chat-dark.png) | ![Settings light](screenshots/settings-personality-light.png) |

| Model Store | Model Selector |
|-------------|----------------|
| ![Model Store](screenshots/model-store.png) | ![Model Selector](screenshots/model-selector-closeup.png) |

## Getting Started (from source)

### Requirements

- Node.js 18+ and npm
- macOS 12+ (Apple Silicon **or** Intel) or Windows 10/11
- ~4 GB free disk for the runtimes (2 GB download for Windows CUDA)
- To *use* the stick: 8 GB RAM minimum (16 GB recommended), USB 3.0+

### Build

```bash
git clone https://github.com/isthatseyi/portable-ai.git
cd portable-ai

# Fetch the embedded Ollama runtime (official release, sha256-verified)
./setup.sh          # current OS only
./setup.sh --all    # Mac + Windows (to build the cross-platform stick)
# Windows: .\setup.ps1   (add -Mac for both runtimes)

cd "Code PAI and App/PAI/PortableAi_Electron_Skeleton"
npm install
npm start           # run in dev
npm run dist        # package: universal DMG/zip on Mac, zip on Windows
```

The Mac build is a **universal binary** (Apple Silicon + Intel). The Windows bundle ships the full CUDA runtime, including support for RTX 50-series (Blackwell) GPUs.

### Putting it on a USB stick

1. Format the drive as **exFAT** (works on both Mac and Windows)
2. Copy the packaged app from `dist/` to the drive
3. Launch it, and let the setup wizard download a model (one-time, needs internet)
4. Done — after that, everything runs fully offline, entirely from the drive

### Daily Use

1. Plug the drive into any Mac or Windows machine
2. Double-click the app
3. Chat

## How It Works

1. `main.js` resolves the portable root (walks out of the `.app` bundle on macOS; uses the exe directory on Windows) and relocates **all** Electron data paths onto the drive — nothing is written to the host
2. A free port is found in **11434–11440** (an already-running Ollama is reused instead)
3. On macOS the embedded binary gets `chmod +x` and `xattr -rd com.apple.quarantine` (exFAT drops exec bits; Gatekeeper flags downloads)
4. Ollama is spawned **from its own directory** (so CUDA/Metal libraries resolve) with `OLLAMA_MODELS` pointed at the drive
5. `config/runtime.json` records port/PID/OS/arch; the default model is preloaded with `keep_alive=-1`
6. On quit, Ollama is stopped and `runtime.json` removed

## Requirements (to run the stick)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 8 GB | 16+ GB |
| USB Speed | USB 2.0 | USB 3.0+ |
| macOS | 12 Monterey | 13+ |
| Windows | 10 | 11 |
| Drive Size | 16 GB | 64 GB+ |
| Drive Format | exFAT | exFAT |

## Model Recommendations

| RAM | Model | Size | Notes |
|-----|-------|------|-------|
| 8 GB | Llama 3.2 3B, Phi-3 Mini, Deepseek-R1 7B | ~2–2.5 GB | Good for basic Q&A and writing |
| 16 GB | Llama 3.1 8B, Deepseek-R1 14B, Gemma 3 12B | ~4–5 GB | Strong general-purpose performance |
| 32 GB+ | Llama 3.1 70B (q4), Qwen 2.5 32B | ~20–40 GB | Near-cloud quality, slower on USB |

The Model Store filters recommendations by your detected RAM automatically.

## Embedded Runtime

The bundled Ollama is the **unmodified official release** (currently v0.21.2). `setup.sh` / `setup.ps1` verify the sha256 of every download against pinned hashes before installing. No binaries are stored in this repository.

## Troubleshooting

### macOS: "PortableAI is damaged" or Gatekeeper block

The app is ad-hoc signed, not notarized. Run this once:

```bash
xattr -rd com.apple.quarantine /Volumes/YOUR_DRIVE/PortableAI.app
```

Or right-click → Open → Open on first launch.

### GPU not used on Windows

Make sure you're on a build that ships the full `lib/ollama` CUDA directory (older bundles stripped it). NVIDIA driver 555+ is required for RTX 50-series cards. The Ollama log (`app_data/data/ollama.log`) prints which GPU it detected at startup.

### Slow first load

The first prompt loads the model from the stick into RAM. USB 3.0+ makes a big difference — on USB 2.0 the initial load can take 30–60 seconds.

### Port conflicts

The app tries ports 11434–11440 automatically and reuses a live Ollama when it finds one. If everything is stuck, the emergency stop scripts live in `app_data/scripts/` (`stop.command` / `stop.bat`).

### Out of memory

If the app crashes or responses are garbled, the model is too large for available RAM. Switch to a smaller model in the Model Store.

## Roadmap

- [ ] Linux support
- [ ] Prompt library on the welcome screen
- [ ] Conversation search
- [ ] RAG / document upload
- [ ] Local-WiFi mobile access (QR code to phone browser)
- [ ] Voice input/output
- [ ] Code signing & notarization

## License

Copyright © 2026 Sammuel Oluwaseyi Johnson — All Rights Reserved. See [LICENSE](LICENSE) for details.
