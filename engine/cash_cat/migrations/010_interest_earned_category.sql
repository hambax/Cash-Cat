-- Savings account interest (distinct from generic salary/dividend income)

INSERT OR IGNORE INTO categories(key, display_name, source, sort_order, archived) VALUES
  ('interest_earned', 'Interest earned', 'preset', 49, 0);
