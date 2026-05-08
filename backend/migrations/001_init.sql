CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  txn_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  cleared BOOLEAN NOT NULL DEFAULT false,
  is_one_time BOOLEAN NOT NULL DEFAULT true,
  recurring_rule_id INT NULL,
  account_id INT REFERENCES accounts(id) ON DELETE SET NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_entries (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly','monthly','yearly')),
  start_date DATE NOT NULL,
  end_date DATE NULL,
  account_id INT REFERENCES accounts(id) ON DELETE SET NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE recurring_entries
  DROP CONSTRAINT IF EXISTS recurring_entries_cadence_check;
ALTER TABLE recurring_entries
  ADD CONSTRAINT recurring_entries_cadence_check
  CHECK (cadence IN ('daily','weekly','monthly','yearly'));

ALTER TABLE recurring_entries
  DROP CONSTRAINT IF EXISTS recurring_end_after_start;
ALTER TABLE recurring_entries
  ADD CONSTRAINT recurring_end_after_start
  CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS recurring_rule_id INT NULL;

CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL CHECK (year >= 2000 AND year <= 3000),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_category_period
  ON budgets (category_id, year, month);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'transactions'
      AND constraint_name = 'transactions_recurring_fk'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_recurring_fk
      FOREIGN KEY (recurring_rule_id)
      REFERENCES recurring_entries(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_cleared ON transactions(cleared);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_entries(active);
CREATE INDEX IF NOT EXISTS idx_recurring_dates ON recurring_entries(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month);
