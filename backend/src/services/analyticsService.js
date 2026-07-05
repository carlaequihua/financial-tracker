import { query } from "../db/query.js";

function addByCadence(date, cadence) {
  const next = new Date(date);
  if (cadence === "daily") next.setDate(next.getDate() + 1);
  else if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "biweekly") next.setDate(next.getDate() + 14);
  else if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function toDateOnly(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
  }
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getEffectiveAmount(row, dueDate) {
  if (
    row.future_amount !== null &&
    row.future_amount !== undefined &&
    row.future_amount_start_date &&
    toIsoDate(dueDate) >= String(row.future_amount_start_date).slice(0, 10)
  ) {
    return row.future_amount;
  }
  return row.amount;
}

function withinRange(candidate, minDate, maxDate) {
  return candidate >= minDate && candidate <= maxDate;
}

function parseOptionalDate(value) {
  return value ? toDateOnly(value) : null;
}

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

function applyModification(row, modification, dueDate) {
  const modified = { ...row };
  if (modification.amount !== null && modification.amount !== undefined) {
    modified.amount = Number(modification.amount);
  }
  if (modification.description) {
    modified.description = modification.description;
  }
  if (modification.account_id !== null && modification.account_id !== undefined) {
    modified.account_id = modification.account_id;
  }
  if (modification.category_id !== null && modification.category_id !== undefined) {
    modified.category_id = modification.category_id;
  }
  return modified;
}

function getApplicableModification(modifications, dueDate, dueDateStr) {
  if (!modifications || modifications.length === 0) return null;
  const normalizedDueDate = toIsoDate(dueDate);
  const oneTimeMatch = modifications
    .filter((mod) => mod.modification_type === "one_time" && normalizeDate(mod.start_date) === normalizedDueDate)
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
  if (oneTimeMatch) return oneTimeMatch;

  const futureMatch = modifications
    .filter((mod) => {
      const startDate = normalizeDate(mod.start_date);
      return mod.modification_type === "future" && startDate <= normalizedDueDate;
    })
    .sort((a, b) => {
      const sa = normalizeDate(a.start_date) || "";
      const sb = normalizeDate(b.start_date) || "";
      if (sa !== sb) return sb.localeCompare(sa);
      return Number(b.id || 0) - Number(a.id || 0);
    })[0];
  if (futureMatch) return futureMatch;

  const rangeMatch = modifications
    .filter((mod) => {
      const startDate = normalizeDate(mod.start_date);
      const endDate = normalizeDate(mod.end_date);
      return mod.modification_type === "date_range" && startDate <= normalizedDueDate && (!endDate || endDate >= normalizedDueDate);
    })
    .sort((a, b) => {
      const sa = normalizeDate(a.start_date) || "";
      const sb = normalizeDate(b.start_date) || "";
      if (sa !== sb) return sb.localeCompare(sa);
      return Number(b.id || 0) - Number(a.id || 0);
    })[0];
  if (rangeMatch) return rangeMatch;

  return null;
}

function pushProjectedRow(result, row, dueDate, modifications = []) {
  const dueDateStr = toIsoDate(dueDate);
  let projectedRow = {
    id: `projected-${row.id}-${dueDateStr}`,
    recurring_rule_id: row.id,
    txn_date: dueDateStr,
    description: row.name,
    amount: getEffectiveAmount(row, dueDate),
    type: row.type,
    cadence: row.cadence,
    account_id: row.account_id,
    category_id: row.category_id,
    account_name: row.account_name,
    category_name: row.category_name,
    cleared: false,
    is_one_time: false,
    projected: true
  };
  const mod = getApplicableModification(modifications, dueDate, dueDateStr);
  if (mod) {
    const overrideTxnDate = normalizeDate(mod.override_txn_date);
    if (mod.modification_type === "one_time" && overrideTxnDate) {
      projectedRow.txn_date = overrideTxnDate;
    }
    if (mod.amount !== null && mod.amount !== undefined) {
      projectedRow.amount = Number(mod.amount);
    }
    if (mod.description) {
      projectedRow.description = mod.description;
    }
    if (mod.account_id !== null && mod.account_id !== undefined) {
      projectedRow.account_id = mod.account_id;
    }
    if (mod.category_id !== null && mod.category_id !== undefined) {
      projectedRow.category_id = mod.category_id;
    }
  }
  result.push(projectedRow);
}

function addSemiweeklyOccurrences(result, row, rangeStart, rangeEnd, endDate, modifications = []) {
  const startDate = toDateOnly(row.start_date);
  const d1 = Number(row.semi_month_day_1);
  const d2 = Number(row.semi_month_day_2);
  const days = [d1, d2].sort((a, b) => a - b);

  const monthCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const monthLimit = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  while (monthCursor <= monthLimit) {
    const seen = new Set();
    const maxDay = daysInMonth(monthCursor.getFullYear(), monthCursor.getMonth());
    for (const day of days) {
      const safeDay = Math.min(day, maxDay);
      const candidate = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), safeDay);
      candidate.setHours(0, 0, 0, 0);
      const key = toIsoDate(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (candidate < startDate) continue;
      if (endDate && candidate > endDate) continue;
      if (!withinRange(candidate, rangeStart, rangeEnd)) continue;
      pushProjectedRow(result, row, candidate, modifications);
    }
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }
}

export async function getProjectedTransactions(filters = {}) {
  const today = toDateOnly(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const rangeStart = parseOptionalDate(filters.from) || today;
  const rangeEnd = parseOptionalDate(filters.to) || today;

  const low = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const high = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
  const projectionStart = low < tomorrow ? tomorrow : low;

  if (high < projectionStart) {
    return [];
  }

  const sql = `
    SELECT
      r.id,
      r.name,
      r.amount,
      r.type,
      r.cadence,
      r.start_date,
      r.end_date,
      r.account_id,
      r.category_id,
      r.future_amount,
      r.future_amount_start_date,
      r.semi_month_day_1,
      r.semi_month_day_2,
      a.name AS account_name,
      c.name AS category_name
    FROM recurring_entries r
    LEFT JOIN accounts a ON a.id = r.account_id
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.active = true
      AND (r.end_date IS NULL OR r.end_date >= $1)
      AND r.start_date <= $2
  `;
  const { rows } = await query(sql, [toIsoDate(projectionStart), toIsoDate(high)]);

  const modSql = `
    SELECT *
    FROM recurring_modifications
    WHERE recurring_rule_id = ANY($1::INT[])
    ORDER BY start_date ASC
  `;
  const recurringIds = rows.map((r) => r.id);
  const modResult = recurringIds.length > 0 ? await query(modSql, [recurringIds]) : { rows: [] };
  const modsByRuleId = {};
  for (const mod of modResult.rows) {
    if (!modsByRuleId[mod.recurring_rule_id]) {
      modsByRuleId[mod.recurring_rule_id] = [];
    }
    modsByRuleId[mod.recurring_rule_id].push(mod);
  }

  const filtered = rows.filter((row) => {
    if (filters.type && row.type !== filters.type) return false;
    if (filters.account_id && Number(row.account_id || 0) !== Number(filters.account_id)) return false;
    if (filters.category_id && Number(row.category_id || 0) !== Number(filters.category_id)) return false;
    return true;
  });

  const result = [];
  for (const row of filtered) {
    const startDate = toDateOnly(row.start_date);
    const endDate = parseOptionalDate(row.end_date);
    const mods = modsByRuleId[row.id] || [];

    if (row.cadence === "semiweekly") {
      addSemiweeklyOccurrences(result, row, projectionStart, high, endDate, mods);
      continue;
    }

    let candidate = new Date(startDate);
    while (candidate < projectionStart) {
      candidate = addByCadence(candidate, row.cadence);
      if (endDate && candidate > endDate) break;
    }

    while (candidate <= high && (!endDate || candidate <= endDate)) {
      if (candidate >= projectionStart) {
        pushProjectedRow(result, row, candidate, mods);
      }
      candidate = addByCadence(candidate, row.cadence);
    }
  }

  result.sort((a, b) => a.txn_date.localeCompare(b.txn_date) || String(a.id).localeCompare(String(b.id)));
  return result;
}

export async function getUpcomingExpenses(days = 30) {
  const windowDays = Number(days) || 30;
  const today = toDateOnly(new Date());
  const to = new Date(today);
  to.setDate(to.getDate() + windowDays);

  const projected = await getProjectedTransactions({
    from: toIsoDate(today),
    to: toIsoDate(to),
    type: "expense"
  });

  return projected.map((row) => ({
    ...row,
    next_due_date: row.txn_date
  }));
}
