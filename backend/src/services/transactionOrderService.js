import { pool } from "../db/pool.js";
import { listTransactions } from "./transactionsService.js";
import { getProjectedTransactions } from "./analyticsService.js";
import { compareTransactions, transactionDate, transactionOrderKey } from "../../../shared/transactionList.js";

export async function reorderTransaction(input = {}) {
  const { date, key, target_key: targetKey, placement } = input || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      !key || !targetKey || key === targetKey || !["before", "after"].includes(placement)) {
    const error = new Error("A date, two distinct transaction keys, and before/after placement are required.");
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`transaction-order:${date}`]);
    const filters = { from: date, to: date };
    const saved = await listTransactions(filters);
    const { rows: bounds } = await client.query(`
      SELECT LEAST($1::DATE, MIN(start_date)) AS from_date,
             GREATEST($1::DATE, MAX(start_date)) AS to_date
      FROM recurring_modifications
      WHERE override_txn_date = $1::DATE
        AND modification_type = 'one_time'
        AND COALESCE(is_deleted, false) = false
    `, [date]);
    const projected = await getProjectedTransactions({
      from: bounds[0]?.from_date ? transactionDate({ txn_date: bounds[0].from_date }) : date,
      to: bounds[0]?.to_date ? transactionDate({ txn_date: bounds[0].to_date }) : date
    });
    const rows = [...saved, ...projected]
      .filter((row) => transactionDate(row) === date)
      .sort(compareTransactions);
    const moving = rows.find((row) => transactionOrderKey(row) === key);
    const remaining = rows.filter((row) => transactionOrderKey(row) !== key);
    const targetIndex = remaining.findIndex((row) => transactionOrderKey(row) === targetKey);
    if (!moving || targetIndex < 0) {
      const error = new Error("Both transactions must exist on the selected date. Refresh and try again.");
      error.status = 409;
      throw error;
    }
    remaining.splice(targetIndex + (placement === "after" ? 1 : 0), 0, moving);
    await client.query(`
      INSERT INTO transaction_order (transaction_key, sort_order)
      SELECT transaction_key, position::INTEGER
      FROM unnest($1::TEXT[]) WITH ORDINALITY AS ordered(transaction_key, position)
      ON CONFLICT (transaction_key) DO UPDATE SET sort_order = EXCLUDED.sort_order
    `, [remaining.map(transactionOrderKey)]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
