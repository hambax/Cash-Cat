-- Split one expense across categories (amounts in cents, positive numbers)

CREATE TABLE IF NOT EXISTS transaction_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL REFERENCES categories(key),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_splits_txn ON transaction_splits(transaction_id);
