#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/../src-tauri/binaries"

mkdir -p "$BIN_DIR"

download() {
  local url="$1"
  local out="$2"
  if [[ -f "$out" ]]; then
    echo "exists: $out"
    return
  fi
  echo "downloading $out ..."
  curl -fsSL -o "$out" "$url"
}

# Windows
download "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" "$BIN_DIR/yt-dlp-x86_64-pc-windows-msvc.exe"

# macOS universal (works on both Intel and ARM)
download "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" "$BIN_DIR/yt-dlp-aarch64-apple-darwin"
chmod +x "$BIN_DIR/yt-dlp-aarch64-apple-darwin"
if [[ ! -f "$BIN_DIR/yt-dlp-x86_64-apple-darwin" ]]; then
  cp "$BIN_DIR/yt-dlp-aarch64-apple-darwin" "$BIN_DIR/yt-dlp-x86_64-apple-darwin"
fi

# Linux
download "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" "$BIN_DIR/yt-dlp-x86_64-unknown-linux-gnu"
chmod +x "$BIN_DIR/yt-dlp-x86_64-unknown-linux-gnu"

echo "yt-dlp binaries ready in $BIN_DIR"