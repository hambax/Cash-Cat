# Installing Cash Cat (desktop)

Cash Cat is a **Tauri** app with a local **Python engine** that runs automatically when you open the application. **We do not use paid Apple or Windows code signing**, so you may need a few one-time steps from the operating system.

Use **UK/NZ English** in any support copy you write to others; technical paths below stay as printed.

## Where to download

Prefer **GitHub Releases** in this repository: tagged builds attach the **`.dmg`** and Windows installer, and the page works without logging in. **Actions** workflow runs also keep **artefacts**, but downloading them from the Actions UI often requires a GitHub account.

## macOS (Apple Silicon — M1 / M2 / M3 / M4 / M5 and newer)

The release `*.dmg` is built for **Apple Silicon** (`aarch64`). It is the right choice for current MacBooks and Mac minis in the M-series.

1. Download the **`.dmg`** from the release, open it, and drag **Cash Cat** into **Applications**.
2. **First open:** **Right‑click** the app in Finder → **Open** (do not only double‑click the first time). This sidesteps a generic “unidentified developer” block.
3. If macOS says the app is **“damaged”** or “cannot be opened” because it was **downloaded from the internet**:
   - In Terminal, run (adjust the app name if it differs):
     ```bash
     xattr -dr com.apple.quarantine "/Applications/Cash Cat.app"
     ```
   - Then right‑click → **Open** again.
4. If it is still blocked: **System Settings** → **Privacy & Security** → look for a message about Cash Cat and choose **Open anyway**.

## macOS (Intel)

CI currently publishes an **Apple Silicon** disk image. **Intel Macs** need either:

- a **local build** from source on an Intel machine (so the PyInstaller engine matches the CPU), or  
- running an Apple Silicon build only if the machine and OS support the combination you use (an Apple Silicon build is not intended for old Intel Macs).

If you add an Intel build to your own pipeline, label the DMG clearly so users pick the correct architecture.

## Windows (x64)

1. Run the **NSIS** `Setup` / `.exe` from the release.
2. If **Microsoft Defender SmartScreen** appears (“Unknown publisher”): choose **More info** → **Run anyway**.
3. The installer can fetch the **WebView2** runtime if it is missing; most recent Windows 10/11 systems already have it.

## After install: connect Akahu

1. Open **Cash Cat** from **Applications** (macOS) or the **Start** menu (Windows).
2. Go to **Settings** and use **Connect Akahu** (or the Akahu section you ship in the app).
3. Paste your **app** token and **user** token as the product explains. They are stored in the local **SQLite** database under the app’s data directory (see in‑app / docs for paths). There is no separate server to configure.

## If the app shows “could not start its engine”

- Use **Open logs folder** and **Try again** on that screen.
- The latest engine log is under the app’s data directory, in a `logs` folder, with a name like `engine-*.log`.
- Reinstalling after an antivirus or security tool has **quarantined** the engine may be necessary on Windows.

## Reporting problems

If something still fails, share:

- **macOS** or **Windows** and version
- A screenshot of the error screen, or the first ~40 lines of the latest `engine-*.log`
