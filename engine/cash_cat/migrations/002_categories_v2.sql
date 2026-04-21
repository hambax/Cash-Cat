-- Categories v2: archived flag + expanded preset taxonomy

ALTER TABLE categories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO categories(key, display_name, source, sort_order, archived) VALUES
  ('fuel', 'Fuel', 'preset', 15, 0),
  ('utilities_internet', 'Internet & mobile', 'preset', 22, 0),
  ('utilities_power', 'Power & gas', 'preset', 24, 0),
  ('rent_mortgage', 'Rent & mortgage', 'preset', 35, 0),
  ('insurance', 'Insurance', 'preset', 38, 0),
  ('healthcare', 'Healthcare', 'preset', 42, 0),
  ('entertainment', 'Entertainment', 'preset', 45, 0),
  ('shopping', 'Shopping', 'preset', 48, 0),
  ('personal_care', 'Personal care', 'preset', 52, 0),
  ('education', 'Education', 'preset', 55, 0),
  ('children', 'Children', 'preset', 58, 0),
  ('pets', 'Pets', 'preset', 61, 0),
  ('gifts_donations', 'Gifts & donations', 'preset', 64, 0),
  ('fees_bank', 'Bank fees', 'preset', 67, 0),
  ('cash_withdrawal', 'Cash withdrawal', 'preset', 70, 0),
  ('travel', 'Travel', 'preset', 73, 0),
  ('subscriptions_software', 'Subscriptions & software', 'preset', 76, 0),
  ('investments', 'Investments', 'preset', 5, 0),
  ('retirement_kiwisaver', 'KiwiSaver & super', 'preset', 8, 0);

-- pattern column stores JSON rule definitions for user rules, e.g.
-- {"kind":"contains_any","terms":["coffee"],"case_insensitive":true}
