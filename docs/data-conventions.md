# Data conventions

## Amounts

- Stored as **integer cents** in SQLite (`amount_cents`).
- **Sign:** positive = inflow (income), negative = outflow (expense). Matches typical bank CSV exports after normalisation.

## Dates

- Transaction dates stored as **ISO 8601 date** strings `YYYY-MM-DD` in the user’s **local calendar** context for v1 (no separate timezone column). Akahu API responses are normalised to the date portion.

## Duplicates

- **CSV:** `dedupe_hash = SHA256(date|amount|description|source_label)`; `INSERT` skips on unique constraint violation.
- **Akahu:** `dedupe_hash = SHA256("akahu"|transaction_id|account_id)`; idempotent upserts. Sync fetches each enabled linked account via **`GET /v1/accounts/{account_id}/transactions`** (with `start` / `end` as ISO 8601 date-times and cursor pagination). Do **not** use `GET /v1/transactions` with an `account` query parameter for per-account sync—that global endpoint returns all connected accounts and does not document that filter, so the same Akahu transaction id could otherwise be inserted once per enabled account.

## Diagnostics

- **`GET /transactions/duplicate-report`** returns clusters of rows that share the same Akahu `external_id` (unexpected duplicates) and, for non-Akahu sources, rows that share the same date, amount, and description (typical CSV double-imports).

## Migrations

- SQL files in `engine/cash_cat/migrations/` named `NNN_description.sql`.
- `PRAGMA user_version` advances after each applied file (see `db.apply_migrations`).

## Engine database path (browser vs Tauri)

- The UI talks to the engine over HTTP (`VITE_ENGINE_URL` in the browser, default `http://127.0.0.1:8787`). The SQLite file is chosen by the **engine process**: `CASH_CAT_DB_PATH`, or `./data/cash_cat.db` relative to the engine’s **current working directory**.
- **`npm run engine`** runs with `cwd` set to `engine/`, so the default file is often `engine/data/cash_cat.db`. The **Tauri** app sets `CASH_CAT_DB_PATH` to the app data directory, which can differ from a dev engine started from the repo.
- If you sync or import into one database but the Transactions page reads another, the table can look empty while the engine is healthy. Align environments by using the same engine instance, or set `CASH_CAT_DB_PATH` explicitly on the engine so it points at the SQLite file you expect.
