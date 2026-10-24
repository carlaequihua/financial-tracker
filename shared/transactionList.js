export function transactionDate(row) {
  return String(row.txn_date instanceof Date ? row.txn_date.toISOString() : row.txn_date).slice(0, 10);
}

export function transactionOrderKey(row) {
  const date = transactionDate(row);
  return row.recurring_rule_id
    ? `recurring:${row.recurring_rule_id}:${date}:${row.account_id || 0}`
    : `transaction:${row.id}`;
}

export function compareTransactions(left, right) {
  const dateOrder = transactionDate(left).localeCompare(transactionDate(right));
  if (dateOrder) return dateOrder;
  const customOrder = Number(left.sort_order || 0) - Number(right.sort_order || 0);
  if (customOrder) return customOrder;
  return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
}

export function matchesTransactionSearch(row, search) {
  const needle = String(search || "").trim().toLocaleLowerCase();
  if (!needle) return true;
  const amount = row.amount == null ? "" : Number(row.amount).toFixed(2);
  return [row.description, row.account_name, row.category_name, row.type, amount]
    .map((value) => String(value ?? "")).join(" ").toLocaleLowerCase().includes(needle);
}