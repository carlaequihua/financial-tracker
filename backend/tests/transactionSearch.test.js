import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const modifications = [];
vi.mock("../src/db/query.js", () => ({ query: (...args) => queryMock(...args) }));
vi.mock("../src/services/recurringMaterializationService.js", () => ({ materializeDueRecurringTransactions: vi.fn(async () => ({})) }));

import { listTransactions } from "../src/services/transactionsService.js";
import { getProjectedTransactions } from "../src/services/analyticsService.js";

describe("transaction search and order lookup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    queryMock.mockReset();
    modifications.length = 0;
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM recurring_entries")) return { rows: [{
        id: 7, name: "Coffee", amount: "12.50", type: "expense", cadence: "monthly",
        start_date: "2026-11-01", account_id: 2, category_id: 1,
        account_name: "Checking", category_name: "Dining"
      }] };
      if (sql.includes("FROM recurring_modifications")) return { rows: modifications };
      if (sql.includes("FROM transaction_order")) return { rows: [{ transaction_key: "recurring:7:2026-11-01:2", sort_order: 4 }] };
      return { rows: [] };
    });
  });

  afterEach(() => vi.useRealTimers());

  it("parameterizes literal search text alongside the selected account", async () => {
    await listTransactions({ search: "  100%_coffee'  ", account_id: 2 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(params).toEqual([2, "100%_coffee'"]);
    expect(sql).toContain("POSITION(LOWER($2)");
    expect(sql).not.toContain("100%_coffee'");
    expect(sql.indexOf("POSITION(LOWER($2)")).toBeGreaterThan(sql.indexOf("SELECT *\n    FROM enriched"));
  });

  it("applies search to projected rows inside the selected account and loads their saved order", async () => {
    const rows = await getProjectedTransactions({ from: "2026-11-01", to: "2026-11-01", search: "COFFEE", account_id: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account_id: 2, sort_order: 4, projected: true });
  });

  it("excludes projected rows outside the selected account", async () => {
    const rows = await getProjectedTransactions({ from: "2026-11-01", to: "2026-11-01", search: "coffee", account_id: 3 });
    expect(rows).toEqual([]);
  });

  it("excludes projected rows that do not match the search", async () => {
    const rows = await getProjectedTransactions({ from: "2026-11-01", to: "2026-11-01", search: "rent" });
    expect(rows).toEqual([]);
  });

  it("searches and filters by the modified occurrence's account and category", async () => {
    modifications.push({ id: 1, recurring_rule_id: 7, modification_type: "one_time", start_date: "2026-11-01",
      account_id: 3, account_name: "Savings", category_id: 2, category_name: "Utilities" });
    const filters = { from: "2026-11-01", to: "2026-11-01", account_id: 3, category_id: 2 };
    const byAccountName = await getProjectedTransactions({ ...filters, search: "Savings" });
    const byCategoryName = await getProjectedTransactions({ ...filters, search: "Utilities" });
    expect(byAccountName).toHaveLength(1);
    expect(byCategoryName).toHaveLength(1);
    expect(byAccountName[0]).toMatchObject({ account_id: 3, category_id: 2 });
    expect(await getProjectedTransactions({ ...filters, account_id: 2 })).toEqual([]);
  });
});