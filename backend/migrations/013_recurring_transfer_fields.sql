ALTER TABLE recurring_entries
  ADD COLUMN IF NOT EXISTS from_account_id INT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_account_id INT NULL REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE recurring_entries
  DROP CONSTRAINT IF EXISTS recurring_entries_type_check;

ALTER TABLE recurring_entries
  ADD CONSTRAINT recurring_entries_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));

ALTER TABLE recurring_entries
  DROP CONSTRAINT IF EXISTS recurring_entries_transfer_accounts_check;

ALTER TABLE recurring_entries
  ADD CONSTRAINT recurring_entries_transfer_accounts_check
  CHECK (
    (type = 'transfer' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND from_account_id <> to_account_id)
    OR (type <> 'transfer' AND from_account_id IS NULL AND to_account_id IS NULL)
  );