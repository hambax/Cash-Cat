-- Cash Cat schema v1 — amounts: outflows negative, inflows positive (NZD assumed single-currency v1)
-- user_version applied by migrator from filename prefix

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'akahu')),
  file_path TEXT,
  file_fingerprint TEXT,
  mapping_json TEXT,
  row_count INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  date_start TEXT,
  date_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS akahu_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  app_token_ref TEXT,
  user_token_ref TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS akahu_accounts (
  akahu_account_id TEXT PRIMARY KEY,
  institution_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  mask TEXT,
  logo_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER REFERENCES imports(id),
  txn_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  description_raw TEXT NOT NULL,
  normalised_merchant TEXT,
  source_label TEXT,
  account_label TEXT,
  provider TEXT,
  external_id TEXT,
  dedupe_hash TEXT NOT NULL,
  akahu_account_id TEXT,
  UNIQUE (dedupe_hash)
);

CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_external ON transactions(external_id);

CREATE TABLE IF NOT EXISTS categories (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('preset', 'user')),
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS category_assignments (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL REFERENCES categories(key),
  is_override INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (transaction_id)
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL,
  pattern TEXT NOT NULL,
  category_key TEXT NOT NULL REFERENCES categories(key)
);

CREATE TABLE IF NOT EXISTS transfer_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debit_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  credit_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reason TEXT,
  excluded INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS anomalies (
  transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  reason_codes TEXT NOT NULL,
  detail_json TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

INSERT OR IGNORE INTO categories(key, display_name, source, sort_order) VALUES
  ('groceries', 'Groceries', 'preset', 10),
  ('transport', 'Transport', 'preset', 20),
  ('utilities', 'Utilities', 'preset', 30),
  ('dining', 'Dining out', 'preset', 40),
  ('income', 'Income', 'preset', 50),
  ('transfer', 'Transfers', 'preset', 60),
  ('other', 'Other', 'preset', 100);
