#!/usr/bin/env node
/**
 * Cross-platform copy of engine/ -> src-tauri/bundled-engine/ for Tauri bundle.resources.
 * Same excludes as scripts/bundle-engine.sh (rsync not available on Windows CI).
 */
import { mkdir, readdir, stat, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "engine");
const DST = path.join(ROOT, "src-tauri", "bundled-engine");

const EXCLUDE_NAMES = new Set([
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv",
  ".mypy_cache",
  "dist",
  "build",
  "tests",
]);

function excludeFile(name) {
  if (name.endsWith(".pyc")) return true;
  if (name.endsWith(".spec")) return true;
  return false;
}

async function copyDir(rel = "") {
  const from = rel ? path.join(SRC, rel) : SRC;
  const to = rel ? path.join(DST, rel) : DST;
  const entries = await readdir(from, { withFileTypes: true });
  for (const e of entries) {
    if (EXCLUDE_NAMES.has(e.name)) continue;
    if (e.isFile() && excludeFile(e.name)) continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    const nextRel = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) {
      await mkdir(d, { recursive: true });
      await copyDir(nextRel);
    } else if (e.isFile()) {
      await mkdir(path.dirname(d), { recursive: true });
      await copyFile(s, d);
    }
  }
}

try {
  await stat(SRC);
} catch {
  console.error(`Source not found: ${SRC}`);
  process.exit(1);
}

await rm(DST, { recursive: true, force: true });
await mkdir(DST, { recursive: true });
await copyDir();
console.log(`Bundled engine to ${DST}`);
