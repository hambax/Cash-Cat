-- Rideshare (Uber, Lyft, Zoomy); merge former Fuel preset into Transport; archive fuel.

INSERT OR IGNORE INTO categories(key, display_name, source, sort_order, archived) VALUES
  ('rideshare', 'Rideshare', 'preset', 18, 0);

-- Budgets: merge fuel row into transport when both exist, otherwise rename fuel → transport.
UPDATE budgets SET monthly_cents = monthly_cents + (SELECT monthly_cents FROM budgets WHERE category_key = 'fuel')
WHERE category_key = 'transport'
  AND EXISTS (SELECT 1 FROM budgets WHERE category_key = 'fuel');

DELETE FROM budgets WHERE category_key = 'fuel' AND EXISTS (SELECT 1 FROM budgets WHERE category_key = 'transport');

UPDATE budgets SET category_key = 'transport' WHERE category_key = 'fuel';

UPDATE transaction_splits SET category_key = 'transport' WHERE category_key = 'fuel';

UPDATE rules SET category_key = 'transport' WHERE category_key = 'fuel';

UPDATE category_assignments SET category_key = 'transport' WHERE category_key = 'fuel';

UPDATE categories SET archived = 1 WHERE key = 'fuel';
