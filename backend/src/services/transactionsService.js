import { query } from "../db/query.js";

function validateTransactionInput(input) {
  if (!input.txn_date) {
    const err = new Error("txn_date is required");
    err.status = 400;
    throw err;
  }
  if (!input.description || !String(input.description).trim()) {
    const err = new Error("description is required");
    err.status = 400;
    throw err;
  }
  if (!["income", "expense"].includes(input.type)) {
    const err = new Error("type must be income or expense");
    err.status = 400;
    throw err;
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("amount must be a non-negative number");
    err.status = 400;
    throw err;
  }
}

function parseFilters(filters = {}) {
  const where = [];
  const params = [];

  const push = (sql, value) => {
    params.push(value);
    where.push(sql.replace("$?", `$${params.length}`));
  };

  if (filters.from) push("t.txn_date >= $?", filters.from);
  if (filters.to) push("t.txn_date <= $?", filters.to);
  if (filters.type) push("t.type = $?", filters.type);
  if (filters.account_id) push("t.account_id = $?", Number(filters.account_id));
  if (filters.category_id) push("t.category_id = $?", Number(filters.category_id));
  if (typeof filters.cleared === "boolean") push("t.cleared = $?", filters.cleared);

  return { where, params };
}

export async function listTransactions(filters = {}) {
  const { where, params } = parseFilters(filters);
  const sql = `
    WITH enriched AS (
      SELECT
        t.id,
        t.txn_date,
        t.description,
        t.amount,
        t.type,
        t.cleared,
        t.is_one_time,
        t.recurring_rule_id,
        t.account_id,
        t.category_id,
        a.name AS account_name,
        c.name AS category_name,
        CASE
          WHEN t.account_id IS NULL THEN NULL
          ELSE SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
            OVER (
              PARTITION BY t.account_id
              ORDER BY t.txn_date ASC, t.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        END AS account_total_as_of
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
    )
    SELECT *
    FROM enriched t
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.txn_date DESC, t.id DESC
  `;
  const { rows } = await query(sql, params);
  return rows;
}

export async function createTransaction(input) {
  validateTransactionInput(input);
  const sql = `
    INSERT INTO transactions
    (txn_date, description, amount, type, cleared, account_id, category_id, is_one_time, recurring_rule_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  const params = [
    input.txn_date,
    input.description,
    Number(input.amount),
    input.type,
    Boolean(input.cleared),
    input.account_id || null,
    input.category_id || null,
    input.is_one_time !== false,
    input.recurring_rule_id || null
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function updateTransaction(id, input) {
  validateTransactionInput(input);
  const sql = `
    UPDATE transactions
    SET txn_date = $1, description = $2, amount = $3, type = $4, cleared = $5,
        account_id = $6, category_id = $7, is_one_time = $8, recurring_rule_id = $9
    WHERE id = $10
    RETURNING *
  `;
  const params = [
    input.txn_date,
    input.description,
    Number(input.amount),
    input.type,
    Boolean(input.cleared),
    input.account_id || null,
    input.category_id || null,
    input.is_one_time !== false,
    input.recurring_rule_id || null,
    id
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function deleteTransaction(id) {
  const { rowCount } = await query("DELETE FROM transactions WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function setTransactionCleared(id, cleared) {
  const { rows } = await query(
    "UPDATE transactions SET cleared = $1 WHERE id = $2 RETURNING *",
    [Boolean(cleared), id]
  );
  return rows[0];
}
