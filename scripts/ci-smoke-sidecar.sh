#!/usr/bin/env bash
# After `tauri build`, start the sidecar on a test port, curl /health, then stop. Run on the build OS.
#
# We prefer the PyInstaller binary in src-tauri/binaries/ (no ".app" path). PyInstaller onefile can fail to
# bootstrap (uvicorn: "Could not import module cash_cat.app") when the same binary is run from
# a path that includes spaces such as "…/Cash Cat.app/…" because productName is "Cash Cat".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BIN="src-tauri/binaries"
SIDECAR=""

# 1) Prefer the file produced by `npm run build:engine-sidecar` (stable path, no .app, usually no space issues).
if [[ -f "$BIN/cash-cat-engine-aarch64-apple-darwin" ]]; then
  SIDECAR="$BIN/cash-cat-engine-aarch64-apple-darwin"
elif [[ -f "$BIN/cash-cat-engine-x86_64-apple-darwin" ]]; then
  SIDECAR="$BIN/cash-cat-engine-x86_64-apple-darwin"
elif [[ -f "$BIN/cash-cat-engine-x86_64-pc-windows-msvc.exe" ]]; then
  SIDECAR="$BIN/cash-cat-engine-x86_64-pc-windows-msvc.exe"
elif [[ -f "$BIN/cash-cat-engine-x86_64-unknown-linux-gnu" ]]; then
  SIDECAR="$BIN/cash-cat-engine-x86_64-unknown-linux-gnu"
fi

# 2) Otherwise take any under target/ but skip paths inside a ".app" bundle.
if [[ -z "$SIDECAR" ]]; then
  while IFS= read -r f; do
    case "$f" in
      *".app"/*) continue ;;
    esac
    SIDECAR=$f
    break
  done < <(find src-tauri/target -type f \( -name "cash-cat-engine" -o -name "cash-cat-engine.exe" -o -name "cash-cat-engine-*" \) 2>/dev/null | head -20)
fi

if [[ -z "$SIDECAR" || ! -f "$SIDECAR" ]]; then
  echo "ci-smoke-sidecar: no cash-cat-engine sidecar found (binaries/ or target/, excluding .app paths)"
  find src-tauri/binaries src-tauri/target -name "cash-cat-engine*" 2>/dev/null | head -30 || true
  exit 1
fi

if [[ "$SIDECAR" != *.exe ]]; then
  chmod +x "$SIDECAR" 2>/dev/null || true
fi

export CASH_CAT_DB_PATH="${TMPDIR:-/tmp}/cash_cat_smoke_$$.db"
rm -f "$CASH_CAT_DB_PATH" 2>/dev/null || true
: > "$CASH_CAT_DB_PATH" 2>/dev/null || true

if command -v python3 &>/dev/null; then
  PORT="$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")"
else
  PORT=19987
fi

echo "ci-smoke-sidecar: using $SIDECAR on $PORT"
"$SIDECAR" --host 127.0.0.1 --port "$PORT" &
SPID=$!
cleanup() { kill "$SPID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 100); do
  if curl -sfS "http://127.0.0.1:${PORT}/health" 2>/dev/null | grep -q '"ok"'; then
    echo "ci-smoke-sidecar: /health OK"
    exit 0
  fi
  sleep 0.1
done
echo "ci-smoke-sidecar: timeout waiting for /health"
exit 1
