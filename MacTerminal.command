#!/usr/bin/env bash
# © 2025 SammuelOluwaseyiJohnson/PortableAi — Proprietary
#
# PortableAI — macOS fallback launcher.
# Starts the embedded Ollama server straight from the USB stick and opens a
# friendly Terminal window. Use this if the packaged PortableAI.app won't launch.
#
# Targets the current v0.21.2 skeleton layout:
#   <CODE>/resources/ollama-darwin/ollama         (binary + dylibs + mlx_metal_v3/v4)
#   <CODE>/app_data/models                         (model blobs — stays on the stick)
#   <CODE>/app_data/data/ollama.log                (server log)
# where <CODE> = .../Code PAI and App/PAI/PortableAi_Electron_Skeleton
set -euo pipefail

# ──────────────────────────────
# 0) macOS only
# ──────────────────────────────
[[ "$(uname -s)" == "Darwin" ]] || { echo "Use Windows.bat on Windows." >&2; exit 1; }

# ──────────────────────────────
# 1) Locate ROOT (this script) and discover the CODE (skeleton) dir dynamically.
#    A "code dir" is one that contains resources/ollama-darwin/ollama.
#    Heuristics, in order:
#      A) $PORTABLEAI_CODE (if set and valid)
#      B) The known relative path from the stick root
#      C) A `find` sweep under the stick root (depth ≤ 6)
# ──────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-"$0"}")" && pwd)"

is_code_dir() {
  local d="$1"
  [[ -f "$d/resources/ollama-darwin/ollama" ]]
}

CODE="${PORTABLEAI_CODE:-}"

if [[ -n "${CODE}" ]] && ! is_code_dir "$CODE"; then
  echo "Warning: PORTABLEAI_CODE is set but not valid: $CODE" >&2
  CODE=""
fi

# B) Known layout: <stick>/Code PAI and App/PAI/PortableAi_Electron_Skeleton
if [[ -z "${CODE}" ]]; then
  CAND="$ROOT/Code PAI and App/PAI/PortableAi_Electron_Skeleton"
  is_code_dir "$CAND" && CODE="$CAND"
fi

# C) Fallback: search for the binary anywhere under the stick root.
if [[ -z "${CODE}" ]]; then
  FOUND="$(/usr/bin/find "$ROOT" -maxdepth 6 -type f -path '*/resources/ollama-darwin/ollama' -print 2>/dev/null | head -n 1 || true)"
  if [[ -n "${FOUND}" ]]; then
    # <CODE>/resources/ollama-darwin/ollama → strip 3 path components.
    CODE="$(cd "$(dirname "$FOUND")/../.." && pwd)"
    is_code_dir "$CODE" || CODE=""
  fi
fi

if [[ -z "${CODE}" ]]; then
  cat >&2 <<EOF
PortableAi: could not locate the app folder.
Expected to find:  resources/ollama-darwin/ollama
Tips:
  • If you moved things, set PORTABLEAI_CODE to the PortableAi_Electron_Skeleton folder and re-run.
  • Example:  export PORTABLEAI_CODE="/Volumes/YOUR STICK/Code PAI and App/PAI/PortableAi_Electron_Skeleton"
EOF
  exit 1
fi

# ──────────────────────────────
# 2) Paths (current layout). Models + log live under app_data on the stick.
# ──────────────────────────────
BINDIR="$CODE/resources/ollama-darwin"
BIN="$BINDIR/ollama"
MODELS="$CODE/app_data/models"
LOG="$CODE/app_data/data/ollama.log"

mkdir -p "$MODELS"
mkdir -p "$(dirname "$LOG")"
: > "$LOG" 2>/dev/null || true

# ──────────────────────────────
# 3) Gatekeeper + exec-bit fix.
#    exFAT does not persist the Unix exec bit, and macOS quarantines every file
#    copied to an external drive — so we ALWAYS re-apply chmod +x and strip the
#    quarantine flag from the whole binary dir (covers the companion .dylibs and
#    the mlx_metal_v3/v4 folders) before launching. Both are safe no-ops if the
#    files are already clean.
# ──────────────────────────────
chmod +x "$BIN" 2>/dev/null || true
xattr -rd com.apple.quarantine "$BINDIR" 2>/dev/null || true

# ──────────────────────────────
# 4) Pick a port in 11434–11440. Reuse a live Ollama if one is already up there,
#    otherwise take the first port with no listener.
# ──────────────────────────────
PORT=""
REUSE=0
for p in 11434 11435 11436 11437 11438 11439 11440; do
  # Is an Ollama already answering here? (curl is present on stock macOS)
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$p/api/version" 2>/dev/null; then
    PORT="$p"; REUSE=1; break
  fi
  # Otherwise, is the port free (nobody listening)?
  if ! /usr/sbin/lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    PORT="$p"; break
  fi
done

if [[ -z "$PORT" ]]; then
  echo "PortableAi: no free port in range 11434–11440. Close other Ollama instances and retry." >&2
  exit 1
fi

# ──────────────────────────────
# 5) Environment. Same vars the Electron app uses. We set NO CPU-forcing vars
#    so the Mac GPU (Metal) is used. OLLAMA_ORIGINS=* lets the file:// UI call the API.
# ──────────────────────────────
export OLLAMA_HOST="127.0.0.1:$PORT"
export OLLAMA_MODELS="$MODELS"
export OLLAMA_KEEP_ALIVE="-1"
export OLLAMA_ORIGINS="*"
# Help the multi-file binary find its dylibs (also cd into BINDIR below).
export DYLD_LIBRARY_PATH="$BINDIR${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"

# ──────────────────────────────
# 6) Start the server (unless reusing one). cd into BINDIR so Metal libs resolve.
# ──────────────────────────────
if [[ "$REUSE" -eq 0 ]]; then
  killall ollama 2>/dev/null || true
  ( cd "$BINDIR" && nohup "$BIN" serve >> "$LOG" 2>&1 & )
fi

# ──────────────────────────────
# 7) Open one friendly console (robust even with spaces/parentheses).
# ──────────────────────────────
osascript - "$CODE" "$PORT" "$LOG" "$MODELS" <<'APPLESCRIPT'
on run argv
  set codePath to item 1 of argv
  set thePort to item 2 of argv
  set logPath to item 3 of argv
  set modelsPath to item 4 of argv
  tell application "Terminal"
    set oldWinIds to (id of windows)
    set nl to ASCII character 10
    set msg to "PortableAi is ready." & nl & nl & ¬
      "Server:      http://127.0.0.1:" & thePort & nl & ¬
      "Server log:  " & logPath & nl & ¬
      "Models dir:  " & modelsPath & nl & nl & ¬
      "Quick start:" & nl & ¬
      "  1) ollama list" & nl & ¬
      "  2) ollama pull tinyllama" & nl & ¬
      "  3) ollama run tinyllama" & nl

    set cmd to "export PATH=" & quoted form of (codePath & "/resources/ollama-darwin") & ":$PATH; " & ¬
      "export OLLAMA_HOST=127.0.0.1:" & thePort & "; " & ¬
      "export OLLAMA_MODELS=" & quoted form of modelsPath & "; " & ¬
      "clear; printf %s " & quoted form of msg & "; echo; exec zsh -l"

    activate
    do script "" -- force a new window
    set uiWin to front window
    do script cmd in uiWin

    repeat with wid in oldWinIds
      try
        if (id of uiWin) is not (wid as integer) then set miniaturized of window id (wid as integer) to true
      end try
    end repeat
  end tell
end run
APPLESCRIPT

exit 0
