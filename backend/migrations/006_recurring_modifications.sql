-- Track modifications to recurring entries
-- modification_type: 'one_time' (single instance), 'future' (from date onward), 'date_range' (specific range)
-- Fields that can be modified: amount, description, account_id, category_id (null means no change to that field)

CREATE TABLE IF NOT EXISTS recurring_modifications (
  id SERIAL PRIMARY KEY,
  recurring_rule_id INT NOT NULL REFERENCES recurring_entries(id) ON DELETE CASCADE,
  modification_type TEXT NOT NULL CHECK (modification_type IN ('one_time', 'future', 'date_range')),
  start_date DATE NOT NULL,
  end_date DATE NULL,
  amount NUMERIC(12,2) NULL,
  description TEXT NULL,
  account_id INT NULL REFERENCES accounts(id) ON DELETE SET NULL,
  category_id INT NULL REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT modification_range_valid
    CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Index for efficient lookups when projecting
CREATE INDEX IF NOT EXISTS idx_recurring_mods_rule_date
  ON recurring_modifications(recurring_rule_id, start_date, end_date);
