# GitHub Actions — desktop installers

This repository includes [`.github/workflows/build.yml`](../.github/workflows/build.yml). It builds:

- **macOS** — `.dmg` (Apple Silicon / `aarch64-apple-darwin`)
- **Windows** — NSIS **`.exe`** installer (`x86_64-pc-windows-msvc`)

It runs:

- `npm run check-versions` (same `version` in `package.json`, [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json), [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml))
- engine tests (`pytest`), TypeScript (`tsc`)
- `tauri build` with the PyInstaller **sidecar** (no bundled Python source in the app bundle — see [PACKAGING.md](PACKAGING.md))
- a **smoke test** that starts the sidecar and hits `/health`
- upload of **Actions artefacts**
- on **version tags** `v*`, a **GitHub Release** with the installers attached (no login required for end users)

**Intel Macs:** CI does **not** publish an `x86_64` macOS installer, because the PyInstaller sidecar must match the machine that built it. See [INSTALL.md](INSTALL.md).

## One-time setup (push this project to GitHub)

1. Install the [GitHub CLI](https://cli.github.com/) (`brew install gh` on macOS).
2. Log in:

   ```bash
   gh auth login
   ```

3. From the **project root**, create a **public** repo and push (pick a free name if `cash-cat` is taken):

   ```bash
   gh repo create cash-cat --public --source . --remote origin --push
   ```

   If the repository already exists on GitHub:

   ```bash
   git remote add origin https://github.com/<your-account>/<repo>.git
   git push -u origin main
   ```

## Build installers (manual)

1. On GitHub: **Actions** → **Build installers** → **Run workflow** → **Run workflow**.
2. When the run finishes, open the workflow run → **Artefacts** at the bottom:
   - `cash-cat-macos-arm64` — the `.dmg`
   - `cash-cat-windows-x64` — the NSIS `setup.exe`

Or from the command line (after `gh auth login`):

```bash
gh workflow run build.yml
gh run watch --exit-status
mkdir -p dist/ci
gh run download -n cash-cat-macos-arm64 -D dist/ci
gh run download -n cash-cat-windows-x64 -D dist/ci
```

## Publish a release (tag)

Align `version` in the three files above, then:

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v0.1.1"   # example
git tag v0.1.1
git push && git push --tags
```

Pushing a tag `v*` runs the same workflow; when all matrix jobs finish, a **Release** is created and the **`.dmg` + `.exe`** are attached. Share the **Releases** page with testers (see [INSTALL.md](INSTALL.md)).

## Notes

- **Unsigned builds** — macOS: **right-click → Open** the first time; Windows: **SmartScreen** (“More info” → run anyway). This project does not assume paid code signing.
- **Windows NSIS** — the workflow installs NSIS via Chocolatey on the runner (`choco install nsis -y`).

See also [PACKAGING.md](PACKAGING.md) for local desktop builds and [INSTALL.md](INSTALL.md) for end-user install steps.
