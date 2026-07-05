ALTER TABLE recurring_entries
  ADD COLUMN IF NOT EXISTS semi_month_day_1 INT NULL,
  ADD COLUMN IF NOT EXISTS semi_month_day_2 INT NULL;

ALTER TABLE recurring_entries
  DROP CONSTRAINT IF EXISTS recurring_entries_cadence_check;

ALTER TABLE recurring_entries
  ADD CONSTRAINT recurring_entries_cadence_check
  CHECK (cadence IN ('daily','weekly','biweekly','semiweekly','monthly','yearly'));
