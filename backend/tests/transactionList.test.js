import { describe, expect, it } from "vitest";
import { compareTransactions, matchesTransactionSearch, transactionOrderKey } from "../../shared/transactionList.js";

describe("transaction list", () => {
  it("retains the occurrence key when a projection becomes a saved transaction", () => {
    const row = { txn_date: "2026-10-24", recurring_rule_id: 7, account_id: 2 };
    expect(transactionOrderKey({ ...row, id: "projected-7-2026-10-24" }))
      .toBe(transactionOrderKey({ ...row, id: 99 }));
  });

  it("sorts same-date rows by custom order before numeric ID", () => {
    const rows = [
      { id: 10, txn_date: "2026-10-24", sort_order: 1 },
      { id: 2, txn_date: "2026-10-24", sort_order: 2 },
      { id: 1, txn_date: "2026-10-25", sort_order: -1 }
    ];
    expect(rows.sort(compareTransactions).map((row) => row.id)).toEqual([10, 2, 1]);
  });

  it("uses numeric rather than lexical order when no custom order exists", () => {
    expect(compareTransactions({ id: 2, txn_date: "2026-10-24" }, { id: 10, txn_date: "2026-10-24" })).toBeLessThan(0);
  });

  it("compares database Date values and serialized dates identically", () => {
    const earlier = { id: 1, txn_date: new Date("2026-10-24T00:00:00Z") };
    const later = { id: 2, txn_date: "2026-11-01" };
    expect(compareTransactions(earlier, later)).toBeLessThan(0);
  });

  it("matches decimal search amounts on numeric projected rows", () => {
    expect(matchesTransactionSearch({ amount: 12.5 }, "12.50")).toBe(true);
  });

  it.each(["coffee", "CHECKING", " Dining ", "expense", "12.50"])("searches transaction fields for %s", (search) => {
    expect(matchesTransactionSearch({ description: "Coffee shop", account_name: "Checking", category_name: "Dining", type: "expense", amount: "12.50" }, search)).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesTransactionSearch({ description: "Coffee" }, "rent")).toBe(false);
  });

  it("keeps every transaction for an empty search", () => {
    expect(matchesTransactionSearch({}, "  ")).toBe(true);
  });
});