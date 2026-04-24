#!/usr/bin/env node
/**
 * Tauri `beforeBuildCommand`: build Vite, then the PyInstaller sidecar.
 * In CI, set `CI_SKIP_SIDECAR=1` on the `tauri build` step when you already ran
 * `npm run build` and `npm run build:engine-sidecar` in separate workflow steps
 * (avoids building the sidecar twice).
 */
import { execSync } from "node:child_process";

if (process.env.CI_SKIP_SIDECAR) {
  // dist/ and src-tauri/binaries/ are already in place.
  process.exit(0);
}

execSync("npm run build", { stdio: "inherit" });
execSync("npm run build:engine-sidecar", { stdio: "inherit" });
