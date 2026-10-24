DROP INDEX IF EXISTS idx_txn_recurring_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_recurring_date
  ON transactions (recurring_rule_id, txn_date)
  WHERE recurring_rule_id IS NOT NULL
    AND transfer_pair_id IS NULL;
