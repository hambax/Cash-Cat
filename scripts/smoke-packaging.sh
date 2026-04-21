#!/usr/bin/env bash
# Pre-release checks (M4). Run from repository root after npm install + engine venv.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== TypeScript =="
npm run build
echo "== Python compile =="
cd engine && python3 -m compileall -q cash_cat && cd ..
echo "== Rust (optional) =="
if command -v cargo >/dev/null 2>&1; then
  (cd src-tauri && cargo check)
else
  echo "cargo not found; skip"
fi
echo "== Done =="
