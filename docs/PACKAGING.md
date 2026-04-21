# Packaging Cash Cat (desktop)

The native shell is **Tauri** ([`src-tauri/`](../src-tauri/)). The UI talks to a local **Python FastAPI** engine.

## Prerequisites (macOS)

- **Node** 18+
- **Rust** — install with [rustup](https://rustup.rs/), then `rustup default stable` so `cargo` works in your shell.
- **Xcode Command Line Tools** — `xcode-select --install` (needed to link the Tauri app).

Ensure `cargo` is on your `PATH` (rustup usually adds `~/.cargo/bin`).

## Build commands

From the project root:

```bash
npm run tauri build
```

That produces **`Cash Cat.app`** under `src-tauri/target/release/bundle/macos/`.

To also create a **DMG** (disk image you can copy to another Mac):

```bash
npm run package:dmg
```

Or both in one go:

```bash
npm run tauri:release
```

**Why a separate DMG step?** Tauri’s bundled `create-dmg` step can fail when the project folder name contains **spaces** (for example `Cash Cat`). The app bundle still builds correctly; [`scripts/create-dmg.sh`](../scripts/create-dmg.sh) uses `hdiutil` with quoted paths so the DMG is created reliably.

**Outputs**

| Artefact | Location |
|----------|----------|
| `.app` | `src-tauri/target/release/bundle/macos/Cash Cat.app` |
| `.dmg` | `src-tauri/target/release/bundle/macos/Cash Cat_<version>_aarch64.dmg` (after `npm run package:dmg`) |

## What gets built

1. **Vite** frontend → `dist/` (`npm run build`).
2. **`bundle:engine`** — copies [`engine/`](../engine/) into `src-tauri/bundled-engine/` via [`scripts/bundle-engine.mjs`](../scripts/bundle-engine.mjs) (no tests, caches, or PyInstaller output). A thin [`scripts/bundle-engine.sh`](../scripts/bundle-engine.sh) wrapper calls the same script.
3. **`build:engine-sidecar`** — PyInstaller produces `src-tauri/binaries/cash-cat-engine-<target-triple>` (see [`scripts/build-engine-sidecar.sh`](../scripts/build-engine-sidecar.sh)).
4. **`tauri build`** — bundles the web assets, copies `bundled-engine` into `Resources/engine`, embeds the sidecar next to the app executable, and produces **`Cash Cat.app`**.

At runtime, [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) starts the **sidecar** if it exists beside the main binary; otherwise it falls back to `python3 -m uvicorn` using the bundled or development `engine/` tree.

## Version numbers

Keep these aligned when you cut a release:

- [`package.json`](../package.json) `version`
- [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) `version`
- [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) `version`

## Icons

From the repo root:

```bash
npm run tauri -- icon path/to/icon-1024.png
```

## macOS code signing and notarisation

For installs on other Macs without Gatekeeper prompts, you need an **Apple Developer** account, **Developer ID Application** signing, and **notarisation**. Configure the environment variables described in the [Tauri macOS distribution guide](https://v2.tauri.app/distribute/macos-application-bundle/). This is optional for local or ad-hoc testing (users may need to use **Open** from the context menu the first time).

## Python dependencies

- Runtime-only list: [`engine/requirements-prod.txt`](../engine/requirements-prod.txt).
- Full dev install (includes pytest): [`engine/requirements.txt`](../engine/requirements.txt).
