-- Per-row include/exclude for totals and analytics (1 = included, 0 = excluded)

ALTER TABLE transactions ADD COLUMN included INTEGER NOT NULL DEFAULT 1;
