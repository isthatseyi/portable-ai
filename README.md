# Portable AI

A cross-platform portable LLM app. Download a model once, then run anywhere with no internet.

**[Download the latest release](https://github.com/isthatseyi/portable-ai/releases/latest)** · [Get it on Gumroad](https://seyijohnson.gumroad.com/l/portable-ai)

![Chat](screenshots/chat-response-dark.png)

## What This Is

An Electron app that bundles [Ollama](https://ollama.com) on a single exFAT-formatted USB drive. Plug it into any Mac or Windows machine, double-click, and chat with a local LLM. The app and your data live on the drive, not the host. No cloud. No accounts.

The same physical drive works on both operating systems.

**Zero telemetry.** No analytics, no crash reporting, no phone-home. The only network calls the app ever makes are the ones you explicitly trigger: downloading a model or refreshing the model catalog.

This repository is **source-only**: the multi-gigabyte Ollama runtime and models are not in git. After cloning, `setup.sh` / `setup.ps1` downloads the official Ollama release (sha256-verified) and drops it in place. Prebuilt, ready-to-run zips are on the [releases page](https://github.com/isthatseyi/portable-ai/releases).

## Why

Every portable AI tool is locked to one platform. [OffGrid AI](https://www.offgridai.app/) is Windows-only and costs $129–$469. Products like [Vision1 Mini](https://vision1.ai/) and [Docket Mini](https://docket.ai/) are hardware-locked to a single OS. This project works on Mac *and* Windows from the same drive, and the source code is free.

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
| ![Dark mode chat](screenshots/chat-response-dark.png) | ![Light mode chat](screenshots/chat-response-light.png) |

| Settings (Chat & Generation) | Settings (Personality) |
|------------------------------|------------------------|
| ![Chat & Generation settings](screenshots/settings-chat-dark.png) | ![Personality settings in light mode](screenshots/settings-personality-light.png) |

| Model Store | Model Selector |
|-------------|----------------|
| ![Model Store with RAM-based filtering](screenshots/model-store.png) | ![Inline model picker](screenshots/model-selector-closeup.png) |

| Code Highlighting | Personality (Dark) |
|-------------------|--------------------|
| ![Syntax-highlighted Python code block](screenshots/code-block.png) | ![Personality settings in dark mode](screenshots/settings-personality-dark.png) |

## Quick Start (prebuilt release)

### Requirements

- USB 3.0+ drive (USB 2.0 works but model loading will be slow)
- 8 GB RAM minimum (16 GB recommended)
- macOS 12+ or Windows 10/11
- Internet connection for the first-time model download only

### Setup

1. Format your USB drive as **exFAT** (works on both Mac and Windows)
2. Download the [latest release](https://github.com/isthatseyi/portable-ai/releases/latest) and extract it to the drive
3. Launch the app:
   - **Mac:** Double-click `PortableAI.app`
   - **Windows:** Double-click `PortableAI.exe` at the drive root
4. The setup wizard will walk you through choosing a theme and downloading a model (one-time, requires internet)
5. Done. After the initial download, the app works fully offline.

> **Note:** Ollama binaries are included in the release. You don't need to install Ollama separately. You only need internet once to pull a model.

### Daily Use

1. Plug the drive into any Mac or Windows machine
2. Double-click the app
3. Chat

## Building from Source

### Requirements

- Node.js 18+ and npm
- macOS 12+ (Apple Silicon **or** Intel) or Windows 10/11
- ~4 GB free disk for the runtimes (2 GB download for Windows CUDA)

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

The Mac build is a **universal binary** (Apple Silicon + Intel). The Windows bundle ships the full CUDA runtime, including support for RTX 50-series (Blackwell) GPUs. To put a build on a stick, format the drive as exFAT and copy the packaged app from `dist/` to the drive.

## How It Works

1. `main.js` resolves the portable root (walks out of the `.app` bundle on macOS; uses the exe directory on Windows) and relocates **all** Electron data paths onto the drive — nothing is written to the host
2. A free port is found in **11434–11440** (an already-running Ollama is reused instead)
3. On macOS the embedded binary gets `chmod +x` and `xattr -rd com.apple.quarantine` (exFAT drops exec bits; Gatekeeper flags downloads)
4. Ollama is spawned **from its own directory** (so CUDA/Metal libraries resolve) with `OLLAMA_MODELS` pointed at the drive
5. `config/runtime.json` records port/PID/OS/arch; the default model is preloaded with `keep_alive=-1`
6. On quit, Ollama is stopped and `runtime.json` removed

### Directory Structure (on the stick)

```
USB Drive (exFAT)
├── PortableAI.app/              # macOS app bundle
├── PortableAI.exe               # Windows launcher (run this one)
└── app_data/
    ├── models/                  # Ollama model blobs and manifests
    ├── data/                    # chat sessions + ollama.log
    ├── config/                  # settings.json / runtime.json
    ├── resources/               # user-placed override binaries
    ├── scripts/                 # emergency stop.command / stop.bat
    └── windows/                 # unpacked Electron app (Windows only)
```

> On Windows, the root `PortableAI.exe` is a lightweight launcher that sets up the working directory and hands off to `app_data/windows/PortableAI.exe`. Run the one at the root.

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

Any model from the [Ollama library](https://ollama.com/library) works. The setup wizard recommends one based on your detected RAM. Here are tested options:

| RAM | Model | Size | Notes |
|-----|-------|------|-------|
| 8 GB | Gemma 3 4B, Phi-4 Mini (3.8B), Llama 3.2 3B | ~2–3 GB | Good for Q&A, writing, and light coding |
| 8 GB | Mistral 7B, Qwen 3 8B | ~4–5 GB | Faster (Mistral) or smarter (Qwen) at this tier |
| 16 GB | Phi-4 14B, Gemma 3 12B, DeepSeek-R1 14B | ~8–9 GB | Strong general-purpose and reasoning performance |
| 16 GB | Qwen 2.5 Coder 14B | ~9 GB | Top local coding model at this size |
| 32 GB+ | Llama 3.3 70B (Q4), Qwen 2.5 32B, Gemma 4 27B | ~20–40 GB | Near-cloud quality; slower on USB |

All sizes are approximate at Q4_K_M quantization. The Model Store filters recommendations by your detected RAM automatically.

## Comparison

| Feature | Portable AI | OffGrid AI | Vision1 Mini | Docket Mini |
|---------|-------------|------------|--------------|-------------|
| Price | **Free** | $129–$469 | ~$40–50 | ~$30–60 |
| macOS | Yes | No | No | Yes |
| Windows | Yes | Yes | Yes | Yes |
| Cross-platform (same drive) | Yes | No | No | No |
| Open source | **Yes (AGPL-3.0)** | No | No | No |
| Choose your own model | Yes | Limited | Limited | Limited |
| Hardware included | No (BYO drive) | Yes | Yes | Yes |

## FAQ

**Do I need internet?**

Only once, to download an AI model through the built-in Model Store. After that, everything runs offline.

**What models can I use?**

Any model from the [Ollama library](https://ollama.com/library). The setup wizard recommends a model based on your available RAM. Popular choices include Gemma 3, Phi-4 Mini, Llama 3.2, Qwen 3, and DeepSeek-R1.

**How fast is it?**

On a MacBook with 16 GB RAM, expect 20–40 tokens/second with a mid-size model at Q4_K_M quantization. First launch takes 30–90 seconds to load the model into memory; after that, responses stream in quickly. USB 3.0+ makes a significant difference over USB 2.0.

**Is this just Ollama with a wrapper?**

Ollama handles model inference. Portable AI adds the full user experience on top: a chat interface with markdown and code highlighting, conversation history, a model store with RAM-based filtering, theme and accent customization, system instructions and personality settings, a memory system, per-model overrides, a setup wizard, cross-platform portability from a single USB drive, and an embedded Ollama lifecycle that starts and stops automatically. You never touch a terminal.

**Can I use this without a USB drive?**

Yes. The app runs from any folder on your local disk. A USB drive gives you portability between machines, but it works fine from your desktop or an external SSD.

**How do I update the app?**

Download the latest release and replace the app files on your drive. Your models, conversations, and settings live in `app_data/` and are preserved across updates.

**Does it work with Apple Silicon?**

Yes. The bundled Ollama binary runs natively on Apple Silicon (M1/M2/M3/M4) Macs. Performance is strong because Apple Silicon's unified memory means the full system RAM is available for model inference.

**Can I run multiple models?**

You can download as many models as your drive has space for. Switch between them mid-conversation using the model selector in the input area. Only one model is loaded into RAM at a time.

## Embedded Runtime

The bundled Ollama is the **unmodified official release** (currently v0.31.1). `setup.sh` / `setup.ps1` verify the sha256 of every download against pinned hashes before installing. No binaries are stored in this repository.

## Verify Your Download

SHA-256 checksums — v1.1.0 (GitHub release assets):

- `PortableAI-1.1.0-mac-universal.zip`: f18d60774bf71313aa4d92ec16ce8f847e081419b625b7e42bbcdb3ed782e012
- `PortableAI-1.1.0-win.zip`: 716099daf592936800c30d9ef26812807d66edd0cad2de075290a95af38934a5

SHA-256 checksums — v1.0.0 (files exactly as served by Gumroad):

- `PortableAi-mac.zip`: 2ecbdd33f948d784c75d388258e1f4c05dbe605c9ccd4ee605046c693f313c66
- `PortableAi-windows.zip`: 9f3870d8fa7bf70ff7f8b3f8a1d930e52646c8b612828c105e8926d50c00ce6b

VirusTotal reports:

- Windows launcher: https://www.virustotal.com/gui/file/4fc0b7dcc4683e5107ea8b964ddc8f5fa4ef71aeddba2a2ff2499d32c30f2223
- Windows app: https://www.virustotal.com/gui/file/ea73ffdf0030a33d7cd93ce62a7367970d96e78d486390a1932d352f68792432
- macOS app binary: https://www.virustotal.com/gui/file/86dde3af906c9c30c21a71844568da834df230c52f9d7b0987e8af947c134035
- Embedded Ollama binaries (unmodified official releases, verifiable by hash): https://www.virustotal.com/gui/file/1a0ac3a49e96cc0f5d81dea0f48f80b1f3fe04c36113e74d52aea92f41b77009, https://www.virustotal.com/gui/file/45993128924d6b01d12c9078d8ac740d6401cf74ece498054917a45f38d447b3

The app is not code-signed yet. If you prefer to sandbox it, it runs fine from a folder inside a VM. And since the full source is in this repository, you can audit it and build your own copy instead of trusting the prebuilt zips.

### Why the Windows launcher shows antivirus detections

A handful of engines flag the root `PortableAI.exe`. Every one of those detections is a generic machine-learning or heuristic verdict, not a match for any known malware family. The actual labels are things like `ML.Attribute.HighConfidence` (Elastic), `Static AI - Suspicious PE` (MaxSecure), `malicious_confidence_70%` (CrowdStrike), `Wacatac.B!ml` (Cynet, a well-documented false-positive bucket), and `Trojan.Malware...susgen` (Fortinet, where "susgen" stands for "suspected generic").

The reason is simple: `PortableAI.exe` is a small, unsigned launcher stub that was freshly built and is not yet widely distributed. Low prevalence plus the absence of a code-signing certificate is exactly the profile that machine-learning antivirus models score as risky, independent of what the program actually does. For comparison, the 211 MB main application and the embedded Ollama binaries (linked above) scan completely clean. Code signing is planned and will clear these flags — and the launcher's source is in this repo at `Code PAI and App/PAI/PortableAi_Electron_Skeleton/scripts/launcher/`.

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
- [ ] Vision chat (image understanding)
- [ ] Prompt library on the welcome screen
- [ ] Conversation search
- [ ] RAG / document upload
- [ ] Local-WiFi mobile access (QR code to phone browser)
- [ ] Voice input/output
- [ ] Code signing & notarization

## License

Copyright (C) 2024-2026 Sammuel Oluwaseyi Johnson

Portable AI is free software: it is licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). See [LICENSE](LICENSE) for the full text.

The embedded Ollama runtime is a separate, unmodified work distributed under its own [MIT license](https://github.com/ollama/ollama/blob/main/LICENSE); it is downloaded from official Ollama releases by `setup.sh` / `setup.ps1` and is not part of this repository.
