#!/usr/bin/env bash
# Create a DMG from the built .app (works when the project path contains spaces; Tauri's bundled create-dmg can fail in that case).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Cash Cat.app"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUT="$ROOT/src-tauri/target/release/bundle/macos/Cash Cat_${VERSION}_aarch64.dmg"

if [[ ! -d "$APP" ]]; then
  echo "Missing $APP — run: npm run tauri build" >&2
  exit 1
fi

echo "Creating DMG: $OUT"
rm -f "$OUT"
hdiutil create -volname "Cash Cat" -srcfolder "$APP" -ov -format UDZO "$OUT"
echo "Done: $OUT"
