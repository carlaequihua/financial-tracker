import { query } from "../db/query.js";

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeOptionalAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  return Number(value);
}

function validateModification(input) {
  if (!input.recurring_rule_id) {
    const err = new Error("recurring_rule_id is required");
    err.status = 400;
    throw err;
  }
  if (!["one_time", "future", "date_range"].includes(input.modification_type)) {
    const err = new Error("modification_type must be one_time, future, or date_range");
    err.status = 400;
    throw err;
  }
  if (!input.start_date) {
    const err = new Error("start_date is required");
    err.status = 400;
    throw err;
  }
  if (input.modification_type === "date_range" && !input.end_date) {
    const err = new Error("end_date is required for date_range modifications");
    err.status = 400;
    throw err;
  }
  if (input.end_date && input.start_date > input.end_date) {
    const err = new Error("end_date must be >= start_date");
    err.status = 400;
    throw err;
  }
  if (input.amount !== undefined && input.amount !== null) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      const err = new Error("amount must be a non-negative number if provided");
      err.status = 400;
      throw err;
    }
  }

  if (input.override_txn_date !== undefined && input.override_txn_date !== null) {
    const override = normalizeDate(input.override_txn_date);
    if (!override) {
      const err = new Error("override_txn_date must be a valid date if provided");
      err.status = 400;
      throw err;
    }
  }
}

export async function listModifications(recurringRuleId) {
  const sql = `
    SELECT *
    FROM recurring_modifications
    WHERE recurring_rule_id = $1
    ORDER BY start_date ASC, id ASC
  `;
  const { rows } = await query(sql, [recurringRuleId]);
  return rows.map((row) => ({
    ...row,
    start_date: normalizeDate(row.start_date),
    end_date: normalizeDate(row.end_date),
    override_txn_date: normalizeDate(row.override_txn_date)
  }));
}

export async function createModification(input) {
  validateModification(input);

  if (input.modification_type === "one_time") {
    const updateExistingSql = `
      UPDATE recurring_modifications
      SET end_date = NULL,
          amount = $3,
          description = $4,
          account_id = $5,
          category_id = $6,
          override_txn_date = $7
      WHERE recurring_rule_id = $1
        AND modification_type = 'one_time'
        AND start_date = $2
      RETURNING *
    `;
    const updateParams = [
      input.recurring_rule_id,
      normalizeDate(input.start_date),
      normalizeOptionalAmount(input.amount),
      input.description || null,
      input.account_id || null,
      input.category_id || null,
      normalizeDate(input.override_txn_date) || null
    ];
    const updatedExisting = await query(updateExistingSql, updateParams);
    if (updatedExisting.rowCount > 0) {
      return updatedExisting.rows[0];
    }
  }

  const sql = `
    INSERT INTO recurring_modifications
    (recurring_rule_id, modification_type, start_date, end_date, amount, description, account_id, category_id, override_txn_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  const params = [
    input.recurring_rule_id,
    input.modification_type,
    input.start_date,
    input.end_date || null,
    normalizeOptionalAmount(input.amount),
    input.description || null,
    input.account_id || null,
    input.category_id || null,
    input.modification_type === "one_time" ? (normalizeDate(input.override_txn_date) || null) : null
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function updateModification(id, input) {
  validateModification(input);
  const sql = `
    UPDATE recurring_modifications
    SET recurring_rule_id = $1, modification_type = $2, start_date = $3, end_date = $4,
        amount = $5, description = $6, account_id = $7, category_id = $8, override_txn_date = $9
    WHERE id = $10
    RETURNING *
  `;
  const params = [
    input.recurring_rule_id,
    input.modification_type,
    input.start_date,
    input.end_date || null,
    normalizeOptionalAmount(input.amount),
    input.description || null,
    input.account_id || null,
    input.category_id || null,
    input.modification_type === "one_time" ? (normalizeDate(input.override_txn_date) || null) : null,
    id
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function deleteModification(id) {
  const { rowCount } = await query("DELETE FROM recurring_modifications WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function getModificationsForDate(recurringRuleId, txnDate) {
  const sql = `
    SELECT *
    FROM recurring_modifications
    WHERE recurring_rule_id = $1
      AND start_date <= $2
      AND (end_date IS NULL OR end_date >= $2)
    ORDER BY modification_type DESC, id DESC
  `;
  const { rows } = await query(sql, [recurringRuleId, normalizeDate(txnDate)]);
  return rows.map((row) => ({
    ...row,
    start_date: normalizeDate(row.start_date),
    end_date: normalizeDate(row.end_date),
    override_txn_date: normalizeDate(row.override_txn_date)
  }));
}
