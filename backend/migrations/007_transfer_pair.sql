ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_transfer_pair ON transactions(transfer_pair_id);
