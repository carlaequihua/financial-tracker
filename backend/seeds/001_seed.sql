INSERT INTO accounts(name) VALUES
  ('Checking'),
  ('Savings'),
  ('Credit Card')
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories(name) VALUES
  ('Salary'),
  ('Rent'),
  ('Groceries'),
  ('Utilities'),
  ('Transport')
ON CONFLICT (name) DO NOTHING;

INSERT INTO transactions (txn_date, description, amount, type, cleared, account_id, category_id)
SELECT CURRENT_DATE - INTERVAL '2 day', 'Paycheck', 2500, 'income', true,
  (SELECT id FROM accounts WHERE name='Checking'),
  (SELECT id FROM categories WHERE name='Salary')
WHERE NOT EXISTS (
  SELECT 1 FROM transactions WHERE description='Paycheck' AND amount=2500
);

INSERT INTO recurring_entries (name, amount, type, cadence, start_date, end_date, account_id, category_id, active)
SELECT 'Monthly Rent', 1200, 'expense', 'monthly', CURRENT_DATE, NULL,
  (SELECT id FROM accounts WHERE name='Checking'),
  (SELECT id FROM categories WHERE name='Rent'),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_entries WHERE name='Monthly Rent'
);

INSERT INTO budgets (category_id, month, year, amount)
SELECT
  (SELECT id FROM categories WHERE name='Groceries'),
  EXTRACT(MONTH FROM CURRENT_DATE)::INT,
  EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  500
WHERE NOT EXISTS (
  SELECT 1 FROM budgets
  WHERE category_id = (SELECT id FROM categories WHERE name='Groceries')
    AND month = EXTRACT(MONTH FROM CURRENT_DATE)::INT
    AND year = EXTRACT(YEAR FROM CURRENT_DATE)::INT
);
