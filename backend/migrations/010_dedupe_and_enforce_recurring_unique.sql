-- Ensure existing environments are deduplicated before enforcing uniqueness.
DELETE FROM transactions t1
WHERE t1.recurring_rule_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM transactions t2
    WHERE t2.recurring_rule_id = t1.recurring_rule_id
      AND t2.txn_date = t1.txn_date
      AND t2.id < t1.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_recurring_date
  ON transactions (recurring_rule_id, txn_date)
  WHERE recurring_rule_id IS NOT NULL;