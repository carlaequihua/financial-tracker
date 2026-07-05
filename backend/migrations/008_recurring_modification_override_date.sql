ALTER TABLE recurring_modifications
  ADD COLUMN IF NOT EXISTS override_txn_date DATE NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_mods_override_date
  ON recurring_modifications(recurring_rule_id, override_txn_date);