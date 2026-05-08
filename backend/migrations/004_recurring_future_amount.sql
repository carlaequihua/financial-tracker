ALTER TABLE recurring_entries
  ADD COLUMN IF NOT EXISTS future_amount NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS future_amount_start_date DATE NULL;
