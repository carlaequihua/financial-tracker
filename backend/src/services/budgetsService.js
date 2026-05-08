import { query } from "../db/query.js";

export async function listBudgets() {
  const sql = `
    SELECT b.*, c.name AS category_name
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
    ORDER BY b.year DESC, b.month DESC, b.id DESC
  `;
  const { rows } = await query(sql);
  return rows;
}

export async function createBudget(input) {
  const sql = `
    INSERT INTO budgets (category_id, month, year, amount)
    VALUES ($1,$2,$3,$4)
    RETURNING *
  `;
  const params = [input.category_id || null, Number(input.month), Number(input.year), Number(input.amount)];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function updateBudget(id, input) {
  const sql = `
    UPDATE budgets
    SET category_id=$1, month=$2, year=$3, amount=$4
    WHERE id=$5
    RETURNING *
  `;
  const params = [input.category_id || null, Number(input.month), Number(input.year), Number(input.amount), id];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function deleteBudget(id) {
  const { rowCount } = await query("DELETE FROM budgets WHERE id=$1", [id]);
  return rowCount > 0;
}

export async function getBudgetAlerts(month, year) {
  const sql = `
    SELECT
      b.id AS budget_id,
      b.category_id,
      c.name AS category_name,
      b.amount AS budget_amount,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0) AS spent,
      (COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END), 0) / NULLIF(b.amount, 0)) * 100 AS pct_used
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN transactions t
      ON t.category_id = b.category_id
      AND EXTRACT(MONTH FROM t.txn_date) = $1
      AND EXTRACT(YEAR FROM t.txn_date) = $2
    WHERE b.month = $1 AND b.year = $2
    GROUP BY b.id, b.category_id, c.name, b.amount
    ORDER BY pct_used DESC NULLS LAST
  `;
  const { rows } = await query(sql, [Number(month), Number(year)]);
  return rows.map((r) => ({
    ...r,
    remaining: Number(r.budget_amount || 0) - Number(r.spent || 0),
    over_budget: Number(r.spent || 0) > Number(r.budget_amount || 0),
    alert: Number(r.pct_used || 0) >= 80
  }));
}
