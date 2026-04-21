#!/usr/bin/env bash
# Legacy wrapper — logic lives in scripts/bundle-engine.mjs (cross-platform; Windows CI has no rsync).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/bundle-engine.mjs"
