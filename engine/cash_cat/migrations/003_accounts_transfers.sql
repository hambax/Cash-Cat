-- Account kinds for transfer detection; extend transfer_pairs metadata

ALTER TABLE akahu_accounts ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'unknown';

-- pair_type: card_repayment | internal_transfer | manual
-- source: auto | user
ALTER TABLE transfer_pairs ADD COLUMN pair_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE transfer_pairs ADD COLUMN source TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE transfer_pairs ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_pairs_debit_credit ON transfer_pairs(debit_id, credit_id);
