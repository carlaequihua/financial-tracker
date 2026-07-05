/**
 * Format a monetary amount with accounting conventions:
 *   positive (income)  →  $1,234.56
 *   expense (debit)    →  $(1,234.56)   ← parentheses, not minus sign
 */
export function formatAmount(amount, type) {
  const abs = Math.abs(Number(amount) || 0);
  const f = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(abs);
  return type === "expense" ? `$(${f})` : `$${f}`;
}

/**
 * Format a balance / net value (can be positive or negative):
 *   positive  →  $1,234.56
 *   negative  →  $(1,234.56)
 */
export function formatBalance(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  const f = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(abs);
  return num < 0 ? `$(${f})` : `$${f}`;
}
