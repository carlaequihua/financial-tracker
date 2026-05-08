import { query } from "../db/query.js";

function addByCadence(date, cadence) {
  const next = new Date(date);
  if (cadence === "daily") next.setDate(next.getDate() + 1);
  else if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

export async function getUpcomingExpenses(days = 30) {
  const windowDays = Number(days) || 30;
  const sql = `
    SELECT id, name, amount, cadence, start_date, end_date, type, account_id, category_id,
           future_amount, future_amount_start_date
    FROM recurring_entries
    WHERE active = true
      AND type = 'expense'
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  `;
  const { rows } = await query(sql);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + windowDays);

  const upcoming = [];
  for (const row of rows) {
    let candidate = new Date(row.start_date);
    candidate.setHours(0, 0, 0, 0);
    const endDate = row.end_date ? new Date(row.end_date) : null;
    if (endDate) endDate.setHours(0, 0, 0, 0);

    while (candidate < today) {
      candidate = addByCadence(candidate, row.cadence);
      if (endDate && candidate > endDate) break;
    }

    if (candidate >= today && candidate <= maxDate && (!endDate || candidate <= endDate)) {
      const effectiveAmount =
        row.future_amount !== null && row.future_amount !== undefined &&
        row.future_amount_start_date && toIsoDate(candidate) >= String(row.future_amount_start_date).slice(0, 10)
          ? row.future_amount
          : row.amount;
      upcoming.push({
        ...row,
        amount: effectiveAmount,
        next_due_date: toIsoDate(candidate)
      });
    }
  }

  upcoming.sort((a, b) => a.next_due_date.localeCompare(b.next_due_date) || a.id - b.id);
  return upcoming;
}
