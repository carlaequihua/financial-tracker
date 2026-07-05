import { query } from "../db/query.js";

let accountsSortReady = false;

async function ensureAccountsSortOrder() {
  if (accountsSortReady) return;
  await query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0");
  await query("UPDATE accounts SET sort_order = id WHERE sort_order = 0");
  accountsSortReady = true;
}

function validateName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    const err = new Error("name is required");
    err.status = 400;
    throw err;
  }
  return trimmed;
}

function normalizeOptionalName(name) {
  if (name === undefined) return undefined;
  return validateName(name);
}

function normalizeOptionalBalance(balance) {
  if (balance === undefined) return undefined;
  const value = Number(balance);
  if (!Number.isFinite(value)) {
    const err = new Error("balance must be a number");
    err.status = 400;
    throw err;
  }
  return value;
}

async function getAccountTransactionNet(id) {
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await query(
    `
    SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)::numeric(12,2) AS txn_net
    FROM transactions
    WHERE account_id = $1
      AND txn_date <= $2
      AND cleared = true
    `,
    [id, today]
  );
  return Number(rows[0]?.txn_net || 0);
}

export async function listAccounts() {
  await ensureAccountsSortOrder();
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await query(
    `
    SELECT
      a.id,
      a.name,
      COALESCE(a.sort_order, 0)::int AS sort_order,
      COALESCE(a.opening_balance, 0)::numeric(12,2) AS opening_balance,
      (COALESCE(a.opening_balance, 0) + COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0))::numeric(12,2) AS balance,
      COUNT(t.id)::int AS transaction_count
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id AND t.txn_date <= $1 AND t.cleared = true
    GROUP BY a.id, a.name, a.sort_order, a.opening_balance
    ORDER BY COALESCE(a.sort_order, 0) ASC, a.name ASC
    `,
    [today]
  );
  return rows;
}

export async function createAccount(input) {
  await ensureAccountsSortOrder();
  const payload = typeof input === "object" && input !== null ? input : { name: input };
  const validated = validateName(payload.name);
  const openingBalance = normalizeOptionalBalance(payload.balance ?? payload.opening_balance) ?? 0;
  const maxRes = await query("SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM accounts");
  const nextSort = Number(maxRes.rows?.[0]?.max_sort_order || 0) + 1;
  const { rows } = await query(
    "INSERT INTO accounts(name, opening_balance, sort_order) VALUES($1, $2, $3) RETURNING *",
    [validated, openingBalance, nextSort]
  );
  return rows[0];
}

export async function updateAccount(id, input) {
  await ensureAccountsSortOrder();
  const payload = typeof input === "object" && input !== null ? input : { name: input };
  const validatedName = normalizeOptionalName(payload.name);
  const requestedBalance = normalizeOptionalBalance(payload.balance);
  const requestedSortOrder = payload.sort_order === undefined ? undefined : Number(payload.sort_order);

  const sets = [];
  const params = [];

  if (validatedName !== undefined) {
    params.push(validatedName);
    sets.push(`name = $${params.length}`);
  }

  if (requestedBalance !== undefined) {
    const txnNet = await getAccountTransactionNet(id);
    const openingBalance = requestedBalance - txnNet;
    params.push(openingBalance);
    sets.push(`opening_balance = $${params.length}`);
  }

  if (requestedSortOrder !== undefined) {
    if (!Number.isInteger(requestedSortOrder)) {
      const err = new Error("sort_order must be an integer");
      err.status = 400;
      throw err;
    }
    params.push(requestedSortOrder);
    sets.push(`sort_order = $${params.length}`);
  }

  if (!sets.length) {
    const err = new Error("name or balance is required");
    err.status = 400;
    throw err;
  }

  params.push(id);
  const { rows } = await query(`UPDATE accounts SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows[0]) {
    const err = new Error("Account not found");
    err.status = 404;
    throw err;
  }
  return rows[0];
}

export async function deleteAccount(id) {
  const { rowCount } = await query("DELETE FROM accounts WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function reorderAccount(id, direction) {
  await ensureAccountsSortOrder();
  if (!["up", "down"].includes(direction)) {
    const err = new Error("direction must be up or down");
    err.status = 400;
    throw err;
  }

  const { rows } = await query("SELECT id, sort_order FROM accounts ORDER BY COALESCE(sort_order, 0) ASC, name ASC");
  const index = rows.findIndex((r) => Number(r.id) === Number(id));
  if (index < 0) {
    const err = new Error("Account not found");
    err.status = 404;
    throw err;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) {
    return { moved: false };
  }

  const current = rows[index];
  const target = rows[targetIndex];

  await query("BEGIN");
  try {
    await query("UPDATE accounts SET sort_order = $1 WHERE id = $2", [target.sort_order, current.id]);
    await query("UPDATE accounts SET sort_order = $1 WHERE id = $2", [current.sort_order, target.id]);
    await query("COMMIT");
    return { moved: true };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

export async function setAccountsOrder(accountIds) {
  await ensureAccountsSortOrder();
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    const err = new Error("accountIds must be a non-empty array");
    err.status = 400;
    throw err;
  }

  const normalized = accountIds.map(Number);
  if (normalized.some((id) => !Number.isInteger(id) || id <= 0)) {
    const err = new Error("accountIds must contain positive integers");
    err.status = 400;
    throw err;
  }

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    const err = new Error("accountIds must not contain duplicates");
    err.status = 400;
    throw err;
  }

  const existing = await query("SELECT id FROM accounts");
  const existingIds = new Set(existing.rows.map((row) => Number(row.id)));
  if (existingIds.size !== normalized.length || normalized.some((id) => !existingIds.has(id))) {
    const err = new Error("accountIds must match all existing accounts");
    err.status = 400;
    throw err;
  }

  await query("BEGIN");
  try {
    for (let i = 0; i < normalized.length; i += 1) {
      await query("UPDATE accounts SET sort_order = $1 WHERE id = $2", [i + 1, normalized[i]]);
    }
    await query("COMMIT");
    return { updated: true };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

export async function listSummary() {
  const [accounts, categories, monthlyTotals, categoryTotals] = await Promise.all([
    listAccounts(),
    listCategories(),
    listMonthlyTotals(),
    listCategoryTotals()
  ]);
  return {
    accounts,
    categories,
    monthlyTotals,
    categoryTotals
  };
}

async function listCategoryTotals() {
  const { rows } = await query(
    `
    SELECT
      c.id,
      c.name,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)::numeric(12,2) AS total_spent,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)::numeric(12,2) AS total_income,
      COUNT(t.id)::int AS transaction_count
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id
    GROUP BY c.id, c.name
    ORDER BY total_spent DESC, c.name ASC
    `
  );
  return rows;
}

async function listMonthlyTotals() {
  const { rows } = await query(
    `
    SELECT
      TO_CHAR(DATE_TRUNC('month', txn_date), 'YYYY-MM') AS month,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::numeric(12,2) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric(12,2) AS spent
    FROM transactions
    GROUP BY DATE_TRUNC('month', txn_date)
    ORDER BY DATE_TRUNC('month', txn_date) ASC
    `
  );
  return rows;
}

export async function createCategory(name) {
  const validated = validateName(name);
  const { rows } = await query("INSERT INTO categories(name) VALUES($1) RETURNING *", [validated]);
  return rows[0];
}

export async function updateCategory(id, name) {
  const validated = validateName(name);
  const { rows } = await query("UPDATE categories SET name = $1 WHERE id = $2 RETURNING *", [validated, id]);
  if (!rows[0]) {
    const err = new Error("Category not found");
    err.status = 404;
    throw err;
  }
  return rows[0];
}

export async function listCategories() {
  const { rows } = await query("SELECT * FROM categories ORDER BY name ASC");
  return rows;
}

export async function deleteCategory(id) {
  const { rowCount } = await query("DELETE FROM categories WHERE id = $1", [id]);
  return rowCount > 0;
}
