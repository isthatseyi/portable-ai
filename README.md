# Portable AI

A cross-platform portable LLM app. Download a model once, then run anywhere with no internet.

![Demo](screenshots/demo.gif)

## What This Is

An Electron app that bundles [Ollama](https://ollama.com) on a single exFAT-formatted USB drive. Plug it into any Mac or Windows machine, double-click, and chat with a local LLM. No installation on the host computer. No cloud. No accounts.

The same physical drive works on both operating systems.

## Why

Every portable AI tool is locked to one platform. [OffGrid AI](https://www.offgridai.app/) is Windows-only and costs $129–$469. Products like [Vision1 Mini](https://vision1.ai/) and [Docket Mini](https://docket.ai/) are hardware-locked to a single OS. This project works on Mac *and* Windows from the same drive, and the source code is free.

## Features

These are the features actually implemented in the current codebase:

- **Streaming chat** — real-time token-by-token response rendering via Ollama's `/api/chat` endpoint
- **Markdown rendering** — headings, bold/italic, lists, blockquotes, tables, and inline code
- **Code syntax highlighting** — keyword, string, comment, and number highlighting with a copy-code button per block
- **Conversation history** — sidebar with saved chat sessions, search, rename, and delete
- **Dark and light themes** — toggle between dark and light mode, persisted across sessions
- **6 accent colors** — purple, blue, green, orange, pink, teal
- **Model selector** — Gemini-style model picker in the input area; switch models mid-session
- **Model Store** — built-in browser for downloading models, filtered by RAM tier, OS, and category (General, Code, Reasoning, Compact), with inline download progress and drive space indicator
- **Settings panel** — 6 tabs: General, Chat & Generation, Models, Behavior & Personality, Memory, Model Overrides
- **Temperature control** — Precise / Balanced / Creative presets (0.2 / 0.6 / 0.9)
- **Context length** — configurable: 2048, 4096, 8192, 16384 tokens
- **System instructions** — per-model or global, with behavior scope selector
- **Personalization** — "About You" field, custom instructions, base style presets (General Assistant, Teacher/Tutor, Coder, Summarizer, Planner/Coach), and tone presets
- **Memory system** — opt-in memory that persists facts across conversations, with auto-cleanup, retention limits, search, and a management UI
- **Model overrides** — per-model settings configuration
- **Install mode toggle** — direct install or cache-and-move (faster for flash drives)
- **First-run setup wizard** — hardware detection, model recommendation by RAM, theme/accent selection, guided model download with progress bar, speed, and ETA
- **"Install Later" option** — skip model download during setup and install from the Model Store later
- **Full app migration** — copy the entire app (executables + models) to a new drive from within the UI
- **Custom model directory** — point Ollama at any folder for model storage
- **Dynamic port scanning** — finds a free port in the 11434–11440 range so it doesn't conflict with a system Ollama
- **Embedded Ollama lifecycle** — auto-start on launch, auto-stop on quit, quarantine attribute removal on macOS
- **Model preloading** — first available model is loaded into RAM at startup (fire-and-forget)
- **Emergency stop scripts** — auto-generated `stop.command` (Mac) and `stop.bat` (Windows) in `app_data/scripts/`
- **Old-path migration** — automatically migrates `ollama_models/`, `appdata/`, and `ollama-embedded.log` from pre-v2 layouts
- **Save & Exit** — graceful shutdown button that stops Ollama and quits the app
- **Jump to bottom** — scroll-to-bottom button when the chat overflows
- **Copy / edit / regenerate** — hover tools on message bubbles
- **Keyboard shortcuts** — `Cmd/Ctrl+B` toggle sidebar, `Cmd/Ctrl+K` new chat, `Enter` send, `Shift+Enter` newline

## Screenshots

| Dark Mode | Light Mode |
|-----------|------------|
| ![Dark mode](screenshots/dark-mode.png) | ![Light mode](screenshots/light-mode.png) |

| Settings | Sidebar |
|----------|---------|
| ![Settings](screenshots/settings.png) | ![Sidebar](screenshots/sidebar.png) |

## Quick Start

### Requirements

- USB 3.0+ drive (USB 2.0 works but model loading will be slow)
- 8 GB RAM minimum (16 GB recommended)
- macOS 12+ or Windows 10/11
- Internet connection for the first-time model download only

### Setup

1. Format your USB drive as **exFAT** (works on both Mac and Windows)
2. Download the latest release and extract it to the drive
3. Launch the app:
   - **Mac:** Open the `.app` bundle
   - **Windows:** Run `PortableAI.exe`
4. The setup wizard will walk you through choosing a theme and downloading a model (one-time, requires internet)
5. Done. After the initial download, the app works fully offline.

> **Note:** Ollama binaries are included in the release. You don't need to install Ollama separately. You only need internet once to pull a model.

### Daily Use

1. Plug the drive into any Mac or Windows machine
2. Double-click the app
3. Chat

## How It Works

### Directory Structure

```
USB Drive (exFAT)
├── PortableAI.app/              # macOS app bundle (or PortableAI.exe on Windows)
│   └── Contents/
│       └── Resources/
│           └── ollama-macos     # embedded Ollama binary
├── app_data/
│   ├── models/                  # Ollama model blobs and manifests
│   │   ├── blobs/
│   │   └── manifests/
│   ├── data/
│   │   ├── sessions/            # saved chat history (JSON)
│   │   └── ollama.log           # runtime log
│   ├── config/
│   │   ├── portable-settings.json  # internal config (custom model path, etc.)
│   │   └── settings.json           # user preferences (theme, accent, temperature, etc.)
│   ├── resources/               # user-placed override binaries
│   └── scripts/
│       ├── stop.command         # emergency kill script (Mac)
│       └── stop.bat             # emergency kill script (Windows)
```

### Launch Sequence

1. **`main.js`** resolves the portable root — on macOS it walks up from the `.app` bundle, on Windows it uses the `.exe` directory
2. `app_data/` subdirectories are created if they don't exist
3. Old path layouts (`ollama_models/`, `appdata/`, `ollama-embedded.log`) are migrated automatically
4. A free port is found in the **11434–11440** range via TCP probe
5. The embedded Ollama binary is located (checking `app_data/resources/` for overrides, then the bundled binary, then fallbacks)
6. On macOS, the binary gets `chmod 755` and `xattr -rd com.apple.quarantine` to bypass Gatekeeper
7. Ollama is spawned with `serve`, pointing `OLLAMA_MODELS` at `app_data/models/` and `OLLAMA_HOST` at `127.0.0.1:<port>`
8. The app waits ~1.5s, confirms Ollama is responding via `/api/tags`, and writes a `runtime.json`
9. The first available model is preloaded into RAM (fire-and-forget)
10. The Electron BrowserWindow loads `webui/index.html`
11. On quit, Ollama is killed and `runtime.json` is cleaned up

## Requirements

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

The Model Store in the app filters recommendations by your detected RAM automatically.

## Comparison

| Feature | Portable AI | OffGrid AI | Vision1 Mini | Docket Mini |
|---------|-------------|------------|--------------|-------------|
| Price | **Free** | $129–$469 | ~$40–50 | ~$30–60 |
| macOS | ✅ | ❌ | ❌ | ✅ |
| Windows | ✅ | ✅ | ✅ | ✅ |
| Cross-platform (same drive) | ✅ | ❌ | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ | ❌ |
| Choose your own model | ✅ | Limited | Limited | Limited |
| Hardware included | ❌ (BYO drive) | ✅ | ✅ | ✅ |

## Troubleshooting

### macOS: "PortableAI is damaged" or Gatekeeper block

The app is not code-signed. Run this once:

```bash
xattr -rd com.apple.quarantine /Volumes/**YOUR_DRIVE**/PortableAI.app
```

Or right-click → Open → Open on first launch.

### Slow first load

The first launch takes longer because Ollama loads the model into RAM. Subsequent prompts are much faster. USB 3.0+ makes a big difference — USB 2.0 can take 30–60 seconds for the initial model load.

### Port conflicts

If you see "port in use" errors, another Ollama instance (or a previous crash) may be holding the port. The app tries ports 11434–11440 automatically. If all are taken, use the emergency stop script:

- **Mac:** Double-click `app_data/scripts/stop.command`
- **Windows:** Double-click `app_data/scripts/stop.bat`

### Out of memory

If the app crashes or responses are garbled, your model is too large for your available RAM. Switch to a smaller model in the Model Store.

## Roadmap

- [ ] Linux support
- [ ] Auto-update mechanism
- [ ] RAG / document upload
- [ ] Image generation
- [ ] Voice input/output
- [ ] Multi-user support
- [ ] Plugin system

## Building from Source

```bash
# Clone the repo
git clone https://github.com/isthatseyi/portable-ai.git
cd portable-ai

# Install dependencies
npm install

# Run in development mode
npm start

# Package for distribution
npm run dist          # current platform
npm run dist:all      # macOS + Windows + Linux

# Build unpacked (for testing)
npm run pack
```

You'll need to supply your own Ollama binaries:
- **macOS:** Place `ollama-macos` in `resources/`
- **Windows:** Place `ollama.exe` and the `lib/` folder in `resources/`

See `package.json` → `build.mac.extraResources` and `build.win.extraResources` for the expected paths.

## License

[MIT](LICENSE) — Copyright © 2026 Sammuel Oluwaseyi Johnson
