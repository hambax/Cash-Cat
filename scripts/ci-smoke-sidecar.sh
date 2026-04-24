#!/usr/bin/env bash
# After `tauri build`, start the sidecar on a test port, curl /health, then stop. Run on the build OS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SIDECAR=$(find src-tauri/target -name "cash-cat-engine-*" -type f 2>/dev/null | head -1 || true)
if [[ -z "$SIDECAR" || ! -f "$SIDECAR" ]]; then
  echo "ci-smoke-sidecar: no cash-cat-engine sidecar under src-tauri/target"
  find src-tauri/target -name "cash-cat-engine*" 2>/dev/null | head -20 || true
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
