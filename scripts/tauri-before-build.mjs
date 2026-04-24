#!/usr/bin/env node
/**
 * Tauri `beforeBuildCommand`: build Vite, then the PyInstaller sidecar.
 *
 * Tauri may spawn this hook with cwd = repo root or cwd = `src-tauri/`
 * depending on platform/version, so we explicitly run every command from the
 * repo root (the directory that owns this script's parent folder).
 *
 * In CI, set `CI_SKIP_SIDECAR=1` on the `tauri build` step when you already
 * ran `npm run build` and `npm run build:engine-sidecar` in separate workflow
 * steps (avoids building the sidecar twice).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

if (process.env.CI_SKIP_SIDECAR) {
  // dist/ and src-tauri/binaries/ are already in place.
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: repoRoot });

run("npm run build");
run("npm run build:engine-sidecar");
