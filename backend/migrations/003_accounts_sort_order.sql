ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

UPDATE accounts
SET sort_order = id
WHERE sort_order = 0;
