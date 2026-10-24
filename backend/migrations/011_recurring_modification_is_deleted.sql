ALTER TABLE recurring_modifications
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recurring_mods_is_deleted
  ON recurring_modifications(recurring_rule_id, is_deleted, start_date);