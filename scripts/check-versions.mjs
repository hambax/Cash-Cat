#!/usr/bin/env node
/**
 * Ensure package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml share the same `version`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tauri = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
const m = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargo);
const cargoVersion = m ? m[1] : null;

if (!cargoVersion) {
  console.error("Could not read version from src-tauri/Cargo.toml [package] section");
  process.exit(1);
}

if (pkg.version !== tauri.version || pkg.version !== cargoVersion) {
  console.error("Version mismatch — align package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml", {
    "package.json": pkg.version,
    "tauri.conf.json": tauri.version,
    "Cargo.toml": cargoVersion,
  });
  process.exit(1);
}

console.log(`Version OK: ${pkg.version}`);
