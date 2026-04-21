# Cash Cat

Local personal finance UI with a Python **engine** (FastAPI + SQLite) and a **Tauri** desktop shell (or a plain browser for development).

## Prerequisites

- **Node** 18+
- **Python** 3 with `fastapi`, `uvicorn`, and engine deps (see `engine/requirements.txt`)
- **Desktop app:** Rust toolchain and Tauri v2 (`@tauri-apps/cli` is in devDependencies)

On **Windows**, if `npm run engine` fails with “python3 not found”, install Python from python.org and ensure `python` is on your `PATH`, then run from `engine`: `python -m uvicorn cash_cat.app:app --host 127.0.0.1 --port 8787 --reload` (the npm script uses `python3`, which some Windows installs do not expose).

## Desktop app (recommended)

Starts Vite, opens the native window, and spawns the engine on a **random localhost port** (the UI asks Tauri for the base URL—no manual port).

```bash
npm install
npm run desktop
```

Equivalent: `npx tauri dev` (runs `beforeDevCommand`: `npm run dev:ui` — Vite only — then loads the app at `http://localhost:1420` inside the shell; Tauri spawns the engine itself).

After pulling engine changes, **restart** `npm run desktop` so a fresh uvicorn process loads the new code.

## Browser only (e.g. Cursor simple browser)

Vite alone **does not** run Tauri, so the UI cannot call `engine_base_url`. It falls back to **`http://127.0.0.1:8787`** (or `VITE_ENGINE_URL` in `.env`).

**Recommended:** one terminal from the project root starts both the UI and the engine:

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:1420`). If you see **“Could not reach the Cash Cat engine”** on Transactions, confirm the engine is up:

```bash
curl -s http://127.0.0.1:8787/health
```

If that fails, check the same terminal for Python or uvicorn errors.

**Alternative:** run Vite and the engine separately (two terminals):

```bash
npm run dev:ui
```

```bash
npm run engine
```

(`npm run dev:full` is the same as `npm run dev`.)

Open the URL Vite prints (usually `http://localhost:1420`). If `/categories` returns **404**, something other than this project’s API may be on that port, or the engine is an old build—restart `npm run engine` from the repo root.

Optional `.env` in the project root:

```env
VITE_ENGINE_URL=http://127.0.0.1:8787
```

## Smoke-check the engine

With the engine running (`npm run engine` or via desktop app—use the port from desktop logs or `8787` for browser dev):

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/categories
```

`/health` should include a `capabilities` list (including `categories`). `/categories` should return `{"items": [...]}` after migrations have run.

## Troubleshooting

### `GET /categories` returns 404 while `/transactions` works

That almost always means the **uvicorn process is stale**: it is still running an older copy of the engine that predates the `/categories` route and the `capabilities` field on `/health`. **Stop** the engine (Ctrl+C in the terminal where it runs, or kill the process on port **8787**), then start it again from the repo root:

```bash
npm run engine
```

Confirm the **running** process matches the repo:

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/categories
```

`/health` must include `"capabilities"` (with `"categories"` inside the list). If it does not, you are not talking to the current engine code.

Ensure dependencies are installed for the same Python you use to run uvicorn:

```bash
cd engine && pip install -r requirements.txt
```

### Akahu tokens

Akahu **app** and **user** tokens are stored in the **local SQLite database** (via app settings) so Connect Akahu and Data settings survive restarts. That is **plaintext on disk** alongside your transactions—appropriate for a local-first app, but **not** the same as storing secrets in the OS keychain.

### Browser dev vs desktop ports

- **Browser at `http://localhost:1420`:** the UI cannot call Tauri, so API requests go to **`http://127.0.0.1:8787`** (or `VITE_ENGINE_URL`). Use **`npm run dev`** (UI + engine together) or **`npm run dev:ui`** plus **`npm run engine`** in another terminal.
- **`npm run desktop`:** Tauri runs **`npm run dev:ui`** (Vite only) and spawns the engine on a **random** localhost port; the UI gets that base URL via `engine_base_url`. Do not assume **8787** unless you are using browser-only dev.

### Engine tests

```bash
cd engine && python3 -m pytest
```

## Production build

```bash
npm run build
npx tauri build
```

## Documentation

- [docs/categorisation.md](docs/categorisation.md) — category rules and overrides  
- [docs/transfers.md](docs/transfers.md) — transfer pairing and analytics exclusions  
- [docs/PACKAGING.md](docs/PACKAGING.md) — local desktop build (`.app` / DMG)  
- [docs/GITHUB_CI.md](docs/GITHUB_CI.md) — build macOS `.dmg` and Windows `.exe` in GitHub Actions
