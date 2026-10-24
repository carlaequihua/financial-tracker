import { query } from "../db/query.js";
import { compareTransactions, transactionOrderKey } from "../../../shared/transactionList.js";

export async function attachTransactionOrder(rows) {
  if (!rows.length) return rows;
  const result = await query(
    "SELECT transaction_key, sort_order FROM transaction_order WHERE transaction_key = ANY($1::TEXT[])",
    [rows.map(transactionOrderKey)]
  );
  const positions = new Map(result.rows.map((row) => [row.transaction_key, row.sort_order]));
  return rows.map((row) => ({ ...row, sort_order: positions.get(transactionOrderKey(row)) || 0 }))
    .sort(compareTransactions);
}