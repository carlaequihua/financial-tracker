import { query } from "../db/query.js";

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

function addByCadence(date, cadence) {
  const next = new Date(date);
  if (cadence === "daily") next.setDate(next.getDate() + 1);
  else if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "biweekly") next.setDate(next.getDate() + 14);
  else if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
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
    return Number(row.future_amount);
  }
  return Number(row.amount);
}

function getApplicableModification(modifications, dueDate) {
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

function buildOccurrencePayload(row, dueDate, modification) {
  const payload = {
    txn_date: toIsoDate(dueDate),
    description: row.name,
    amount: getEffectiveAmount(row, dueDate),
    type: row.type,
    account_id: row.account_id,
    category_id: row.category_id
  };

  if (!modification) return payload;

  if (modification.modification_type === "one_time" && modification.override_txn_date) {
    payload.txn_date = normalizeDate(modification.override_txn_date);
  }
  if (modification.amount !== null && modification.amount !== undefined) {
    payload.amount = Number(modification.amount);
  }
  if (modification.description) {
    payload.description = modification.description;
  }
  if (modification.account_id !== null && modification.account_id !== undefined) {
    payload.account_id = modification.account_id;
  }
  if (modification.category_id !== null && modification.category_id !== undefined) {
    payload.category_id = modification.category_id;
  }

  return payload;
}

function enumerateScheduledDates(row, cutoffDate) {
  const startDate = toDateOnly(row.start_date);
  const endDate = row.end_date ? toDateOnly(row.end_date) : null;
  const upper = endDate && endDate < cutoffDate ? endDate : cutoffDate;
  if (upper < startDate) return [];

  if (row.cadence === "semiweekly") {
    const d1 = Number(row.semi_month_day_1);
    const d2 = Number(row.semi_month_day_2);
    const days = [d1, d2].sort((a, b) => a - b);
    const result = [];
    const monthCursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const monthLimit = new Date(upper.getFullYear(), upper.getMonth(), 1);

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
        if (candidate > upper) continue;
        result.push(candidate);
      }
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }

    return result;
  }

  const result = [];
  let candidate = new Date(startDate);
  while (candidate <= upper) {
    result.push(new Date(candidate));
    candidate = addByCadence(candidate, row.cadence);
  }
  return result;
}

function buildValidTxnDateSet(row, cutoffDate, modifications = []) {
  const validDates = new Set();
  const scheduledDates = enumerateScheduledDates(row, cutoffDate);

  for (const dueDate of scheduledDates) {
    const mod = getApplicableModification(modifications, dueDate);
    const payload = buildOccurrencePayload(row, dueDate, mod);
    const txnDate = normalizeDate(payload.txn_date);
    if (!txnDate) continue;
    if (txnDate > toIsoDate(cutoffDate)) continue;
    validDates.add(txnDate);
  }

  return validDates;
}

export async function materializeDueRecurringTransactions({ cutoffDate } = {}) {
  const cutoffIso = normalizeDate(cutoffDate) || toIsoDate(toDateOnly(new Date()));
  const cutoff = toDateOnly(cutoffIso);

  // Keep generated recurring instances aligned with the current rule bounds.
  // If a rule start/end date changes, stale uncleared generated rows are removed.
  await query(`
    DELETE FROM transactions t
    USING recurring_entries r
    WHERE t.recurring_rule_id = r.id
      AND t.is_one_time = false
      AND t.cleared = false
      AND (
        t.txn_date < r.start_date
        OR (r.end_date IS NOT NULL AND t.txn_date > r.end_date)
      )
  `);

  const recurringSql = `
    SELECT
      id,
      name,
      amount,
      type,
      cadence,
      start_date,
      end_date,
      account_id,
      category_id,
      future_amount,
      future_amount_start_date,
      semi_month_day_1,
      semi_month_day_2
    FROM recurring_entries
    WHERE active = true
      AND start_date <= $1
      AND (end_date IS NULL OR end_date >= start_date)
  `;
  const { rows: recurringRows } = await query(recurringSql, [cutoffIso]);
  if (recurringRows.length === 0) {
    return { inserted: 0, scanned_rules: 0 };
  }

  const recurringIds = recurringRows.map((row) => row.id);
  const existingSql = `
    SELECT recurring_rule_id, txn_date
    FROM transactions
    WHERE recurring_rule_id = ANY($1::INT[])
      AND txn_date <= $2
  `;
  const generatedSql = `
    SELECT id, recurring_rule_id, txn_date
    FROM transactions
    WHERE recurring_rule_id = ANY($1::INT[])
      AND is_one_time = false
      AND cleared = false
      AND txn_date <= $2
  `;
  const modSql = `
    SELECT *
    FROM recurring_modifications
    WHERE recurring_rule_id = ANY($1::INT[])
    ORDER BY start_date ASC, id ASC
  `;

  const [existingResult, generatedResult, modResult] = await Promise.all([
    query(existingSql, [recurringIds, cutoffIso]),
    query(generatedSql, [recurringIds, cutoffIso]),
    query(modSql, [recurringIds])
  ]);

  const existingKeys = new Set(
    existingResult.rows.map((row) => `${row.recurring_rule_id}|${normalizeDate(row.txn_date)}`)
  );

  const modsByRuleId = new Map();
  for (const mod of modResult.rows) {
    const key = Number(mod.recurring_rule_id);
    const bucket = modsByRuleId.get(key) || [];
    bucket.push(mod);
    modsByRuleId.set(key, bucket);
  }

  const staleGeneratedIds = [];
  for (const row of recurringRows) {
    const ruleId = Number(row.id);
    const mods = modsByRuleId.get(ruleId) || [];
    const validDates = buildValidTxnDateSet(row, cutoff, mods);
    const generatedRows = generatedResult.rows.filter((txn) => Number(txn.recurring_rule_id) === ruleId);
    for (const txn of generatedRows) {
      const txnDate = normalizeDate(txn.txn_date);
      if (!txnDate) continue;
      if (!validDates.has(txnDate)) {
        staleGeneratedIds.push(Number(txn.id));
      }
    }
  }

  if (staleGeneratedIds.length > 0) {
    await query("DELETE FROM transactions WHERE id = ANY($1::INT[])", [staleGeneratedIds]);
    for (const stale of generatedResult.rows) {
      if (!staleGeneratedIds.includes(Number(stale.id))) continue;
      const key = `${stale.recurring_rule_id}|${normalizeDate(stale.txn_date)}`;
      existingKeys.delete(key);
    }
  }

  const insertSql = `
    INSERT INTO transactions
      (txn_date, description, amount, type, cleared, account_id, category_id, is_one_time, recurring_rule_id)
    VALUES ($1, $2, $3, $4, false, $5, $6, false, $7)
    ON CONFLICT DO NOTHING
  `;

  let inserted = 0;

  for (const row of recurringRows) {
    const scheduledDates = enumerateScheduledDates(row, cutoff);
    const mods = modsByRuleId.get(Number(row.id)) || [];

    for (const dueDate of scheduledDates) {
      const mod = getApplicableModification(mods, dueDate);
      const payload = buildOccurrencePayload(row, dueDate, mod);
      const txnDate = normalizeDate(payload.txn_date);
      if (!txnDate || txnDate > cutoffIso) continue;

      const dedupeKey = `${row.id}|${txnDate}`;
      if (existingKeys.has(dedupeKey)) continue;

      const insertResult = await query(insertSql, [
        txnDate,
        payload.description,
        Number(payload.amount),
        payload.type,
        payload.account_id || null,
        payload.category_id || null,
        row.id
      ]);
      existingKeys.add(dedupeKey);
      inserted += Number(insertResult.rowCount || 0);
    }
  }

  return { inserted, scanned_rules: recurringRows.length };
}