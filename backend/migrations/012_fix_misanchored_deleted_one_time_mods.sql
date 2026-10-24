-- Backfill fix for previously mis-anchored one-time deletion markers.
-- If a deleted one-time modification was stored on date D, and there is an
-- existing one-time override that moves some anchor date to D, mark that anchor
-- modification as deleted as well so the moved occurrence is truly skipped.

WITH source_mods AS (
  SELECT DISTINCT src.id
  FROM recurring_modifications del
  JOIN recurring_modifications src
    ON src.recurring_rule_id = del.recurring_rule_id
   AND src.modification_type = 'one_time'
   AND src.override_txn_date = del.start_date
  WHERE del.modification_type = 'one_time'
    AND COALESCE(del.is_deleted, false) = true
    AND COALESCE(src.is_deleted, false) = false
)
UPDATE recurring_modifications m
SET is_deleted = true,
    amount = NULL,
    description = NULL,
    account_id = NULL,
    category_id = NULL,
    override_txn_date = NULL,
    end_date = NULL
FROM source_mods s
WHERE m.id = s.id;
