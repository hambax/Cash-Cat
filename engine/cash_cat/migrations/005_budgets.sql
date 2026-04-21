-- Monthly budgets per category (NZD cents)

CREATE TABLE IF NOT EXISTS budgets (
  category_key TEXT NOT NULL PRIMARY KEY REFERENCES categories(key),
  monthly_cents INTEGER NOT NULL,
  starts_on TEXT NOT NULL DEFAULT (date('now'))
);
