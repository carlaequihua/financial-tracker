import { query } from "../db/query.js";

function validateRecurringInput(input) {
  if (!input.name || !String(input.name).trim()) {
    const err = new Error("name is required");
    err.status = 400;
    throw err;
  }
  if (!["income", "expense"].includes(input.type)) {
    const err = new Error("type must be income or expense");
    err.status = 400;
    throw err;
  }
  if (!["daily", "weekly", "biweekly", "semiweekly", "monthly", "yearly"].includes(input.cadence || "monthly")) {
    const err = new Error("cadence must be daily, weekly, biweekly, semiweekly, monthly, or yearly");
    err.status = 400;
    throw err;
  }
  if (!input.start_date) {
    const err = new Error("start_date is required");
    err.status = 400;
    throw err;
  }
  if (input.end_date && input.end_date < input.start_date) {
    const err = new Error("end_date cannot be before start_date");
    err.status = 400;
    throw err;
  }

  if ((input.cadence || "monthly") === "semiweekly") {
    const day1 = Number(input.semi_month_day_1);
    const day2 = Number(input.semi_month_day_2);
    if (!Number.isInteger(day1) || day1 < 1 || day1 > 31) {
      const err = new Error("semi_month_day_1 must be an integer between 1 and 31");
      err.status = 400;
      throw err;
    }
    if (!Number.isInteger(day2) || day2 < 1 || day2 > 31) {
      const err = new Error("semi_month_day_2 must be an integer between 1 and 31");
      err.status = 400;
      throw err;
    }
    if (day1 === day2) {
      const err = new Error("semi_month_day_1 and semi_month_day_2 must be different");
      err.status = 400;
      throw err;
    }
  }

  const hasFutureAmount = input.future_amount !== undefined && input.future_amount !== null && input.future_amount !== "";
  const hasFutureStart = Boolean(input.future_amount_start_date);
  if (hasFutureAmount !== hasFutureStart) {
    const err = new Error("future_amount and future_amount_start_date must be provided together");
    err.status = 400;
    throw err;
  }
  if (hasFutureAmount) {
    const amount = Number(input.future_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      const err = new Error("future_amount must be a non-negative number");
      err.status = 400;
      throw err;
    }
    if (input.future_amount_start_date < input.start_date) {
      const err = new Error("future_amount_start_date cannot be before start_date");
      err.status = 400;
      throw err;
    }
  }
}

export async function listRecurring() {
  const { rows } = await query("SELECT * FROM recurring_entries ORDER BY id DESC");
  return rows;
}

export async function createRecurring(input) {
  validateRecurringInput(input);
  const sql = `
    INSERT INTO recurring_entries
    (name, amount, type, cadence, start_date, end_date, account_id, category_id, active, future_amount, future_amount_start_date,
     semi_month_day_1, semi_month_day_2)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `;
  const params = [
    input.name,
    Number(input.amount),
    input.type,
    input.cadence || "monthly",
    input.start_date,
    input.end_date || null,
    input.account_id || null,
    input.category_id || null,
    input.active !== false,
    input.future_amount === undefined || input.future_amount === null || input.future_amount === "" ? null : Number(input.future_amount),
    input.future_amount_start_date || null,
    input.cadence === "semiweekly" ? Number(input.semi_month_day_1) : null,
    input.cadence === "semiweekly" ? Number(input.semi_month_day_2) : null
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function updateRecurring(id, input) {
  validateRecurringInput(input);
  const sql = `
    UPDATE recurring_entries
    SET name=$1, amount=$2, type=$3, cadence=$4, start_date=$5, end_date=$6, account_id=$7, category_id=$8, active=$9,
        future_amount=$10, future_amount_start_date=$11, semi_month_day_1=$12, semi_month_day_2=$13
    WHERE id=$14
    RETURNING *
  `;
  const params = [
    input.name,
    Number(input.amount),
    input.type,
    input.cadence || "monthly",
    input.start_date,
    input.end_date || null,
    input.account_id || null,
    input.category_id || null,
    input.active !== false,
    input.future_amount === undefined || input.future_amount === null || input.future_amount === "" ? null : Number(input.future_amount),
    input.future_amount_start_date || null,
    input.cadence === "semiweekly" ? Number(input.semi_month_day_1) : null,
    input.cadence === "semiweekly" ? Number(input.semi_month_day_2) : null,
    id
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function deleteRecurring(id) {
  const { rowCount } = await query("DELETE FROM recurring_entries WHERE id=$1", [id]);
  return rowCount > 0;
}
