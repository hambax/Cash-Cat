# GitHub Actions — desktop installers

This repository includes [`.github/workflows/build.yml`](../.github/workflows/build.yml), a **manual** workflow that builds:

- **macOS** — `.dmg` (Apple Silicon / `aarch64`)
- **Windows** — NSIS **`.exe`** installer (`x86_64`)

It runs tests (`pytest`, `tsc`), then `tauri build` with the PyInstaller engine sidecar.

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

## Build installers

1. On GitHub: **Actions** → **Build installers** → **Run workflow** → **Run workflow**.
2. When the run finishes, open the workflow run → **Artefacts** at the bottom:
   - `cash-cat-macos-arm64` — download the `.dmg`
   - `cash-cat-windows-x64` — download the NSIS `setup.exe`

Or from the command line (after `gh auth login`):

```bash
gh workflow run build.yml
gh run watch --exit-status
mkdir -p dist/ci
gh run download -n cash-cat-macos-arm64 -D dist/ci
gh run download -n cash-cat-windows-x64 -D dist/ci
```

## Notes

- **Unsigned builds** — macOS may require **right-click → Open** the first time; Windows may show **SmartScreen** (“More info” → run anyway). Paid code signing is optional for a smoother experience.
- **Windows NSIS** — the workflow installs NSIS via Chocolatey on the runner (`choco install nsis`).
- **Engine bundle** — `npm run bundle:engine` uses [`scripts/bundle-engine.mjs`](../scripts/bundle-engine.mjs) so CI works on Windows (no `rsync` required).

See also [PACKAGING.md](PACKAGING.md) for local macOS packaging and versioning.
