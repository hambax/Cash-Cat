#!/usr/bin/env bash
# Build PyInstaller sidecar for the current Tauri target triple and place it under src-tauri/binaries/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$ROOT/engine"
OUT="$ROOT/src-tauri/binaries"
mkdir -p "$OUT"

cd "$ENGINE"

PYTHON=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON="python"
else
  echo "Python not found (need python3 or python on PATH)."
  exit 1
fi

"$PYTHON" -c "import PyInstaller" 2>/dev/null || {
  echo "Installing PyInstaller."
  "$PYTHON" -m pip install pyinstaller
}

"$PYTHON" -m pip install -q -r requirements-prod.txt
"$PYTHON" -m pip install -q pyinstaller

pyinstaller --noconfirm cash_cat_engine.spec

RAW="$ENGINE/dist/cash-cat-engine"
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then
    TRIPLE="aarch64-apple-darwin"
  else
    TRIPLE="x86_64-apple-darwin"
  fi
  TARGET="$OUT/cash-cat-engine-$TRIPLE"
  mv -f "$RAW" "$TARGET"
  chmod +x "$TARGET"
  echo "Built sidecar: $TARGET"
elif [[ "$(uname -s)" == "Linux" ]]; then
  TRIPLE="x86_64-unknown-linux-gnu"
  TARGET="$OUT/cash-cat-engine-$TRIPLE"
  mv -f "$RAW" "$TARGET"
  chmod +x "$TARGET"
  echo "Built sidecar: $TARGET"
elif [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]]; then
  TRIPLE="x86_64-pc-windows-msvc"
  RAW="$ENGINE/dist/cash-cat-engine.exe"
  TARGET="$OUT/cash-cat-engine-$TRIPLE.exe"
  mv -f "$RAW" "$TARGET"
  echo "Built sidecar: $TARGET"
else
  echo "Unsupported OS for sidecar; leaving dist/ as-is."
  exit 1
fi
