#!/usr/bin/env bash
# ============================================================
# Portable AI — one-time setup after cloning.
#
# Downloads the embedded Ollama runtime (official upstream
# release, sha256-verified) into the Electron app's resources/
# folder. The binaries are too large for git, so the repo is
# source-only and this script reconstructs the rest.
#
# Usage:
#   ./setup.sh            # runtime for THIS machine's OS only
#   ./setup.sh --all      # Mac + Windows (needed to build the
#                         # cross-platform USB stick; ~2.1 GB)
#   ./setup.sh --mac      # Mac runtime only   (~130 MB)
#   ./setup.sh --windows  # Windows runtime only (~2 GB)
# ============================================================
set -euo pipefail

OLLAMA_VERSION="v0.21.2"
DARWIN_ASSET="ollama-darwin.tgz"
DARWIN_SHA="f14bb761dc3ef251a68081b4888920c187abe3ed53483db813ee8fb9c0a1af3e"
WINDOWS_ASSET="ollama-windows-amd64.zip"
WINDOWS_SHA="624caabca19a27168dd2b165ac538a0c6f2c6bcc94098439944fa351ff7b11e2"
BASE_URL="https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
RES="$ROOT/Code PAI and App/PAI/PortableAi_Electron_Skeleton/resources"
TMP="$RES/_setup_tmp"

want_mac=false
want_win=false
case "${1:-}" in
  --all)     want_mac=true; want_win=true ;;
  --mac)     want_mac=true ;;
  --windows) want_win=true ;;
  "")        if [[ "$(uname -s)" == "Darwin" ]]; then want_mac=true; else want_win=true; fi ;;
  *) echo "Unknown option: $1 (use --all, --mac, or --windows)"; exit 1 ;;
esac

download_verify() { # url, dest, sha256
  local url="$1" dest="$2" sha="$3"
  if [[ -f "$dest" ]] && echo "$sha  $dest" | shasum -a 256 -c - >/dev/null 2>&1; then
    echo "Already downloaded and verified: $(basename "$dest")"
    return 0
  fi
  echo "Downloading $(basename "$dest") ..."
  curl -L --fail --retry 3 -o "$dest" "$url"
  echo "$sha  $dest" | shasum -a 256 -c - || {
    echo "ERROR: sha256 mismatch for $dest — delete it and re-run."; exit 1; }
}

mkdir -p "$RES" "$TMP"

if $want_mac; then
  download_verify "$BASE_URL/$DARWIN_ASSET" "$TMP/$DARWIN_ASSET" "$DARWIN_SHA"
  echo "Extracting Mac runtime ..."
  rm -rf "$TMP/darwin" && mkdir -p "$TMP/darwin"
  tar -xzf "$TMP/$DARWIN_ASSET" -C "$TMP/darwin"
  rm -rf "$RES/ollama-darwin" && mkdir -p "$RES/ollama-darwin"
  # -L dereferences symlinks: exFAT sticks and Windows can't hold them.
  if command -v rsync >/dev/null; then
    rsync -rL --exclude '._*' "$TMP/darwin/" "$RES/ollama-darwin/"
  else
    cp -RL "$TMP/darwin/." "$RES/ollama-darwin/"
  fi
  chmod +x "$RES/ollama-darwin/ollama"
  echo "Mac runtime installed → resources/ollama-darwin/"
fi

if $want_win; then
  download_verify "$BASE_URL/$WINDOWS_ASSET" "$TMP/$WINDOWS_ASSET" "$WINDOWS_SHA"
  echo "Extracting Windows runtime (this is ~3.4 GB unpacked) ..."
  rm -rf "$RES/ollama-windows-amd64" && mkdir -p "$RES/ollama-windows-amd64"
  unzip -oq "$TMP/$WINDOWS_ASSET" -d "$RES/ollama-windows-amd64"
  echo "Windows runtime installed → resources/ollama-windows-amd64/"
fi

# Keep the verified archives? They're large; drop them by default.
rm -rf "$TMP"

echo
echo "Done. Next steps:"
echo "  cd \"$ROOT/Code PAI and App/PAI/PortableAi_Electron_Skeleton\""
echo "  npm install"
echo "  npm start          # run in dev"
echo "  npm run dist       # build DMG/zip (Mac) or zip (Windows)"
