-- Per-transaction manual tags (JSON array of slug strings), distinct from categories

ALTER TABLE transactions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
