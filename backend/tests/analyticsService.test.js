import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../src/db/query.js", () => ({
  query: (...args) => queryMock(...args)
}));

import { getProjectedTransactions } from "../src/services/analyticsService.js";

describe("getProjectedTransactions", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("does not return projected rows that already exist as real recurring transactions", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 11,
              name: "Jan Salary - Rev",
              amount: "1625.00",
              type: "income",
              cadence: "monthly",
              start_date: "2026-07-24",
              end_date: null,
              account_id: 1,
              category_id: 2,
              future_amount: null,
              future_amount_start_date: null,
              semi_month_day_1: null,
              semi_month_day_2: null,
              account_name: "Shared Chase",
              category_name: "Jan Salary"
            }
          ]
        };
      }
      if (String(sql).includes("FROM recurring_modifications")) {
        return { rows: [] };
      }
      if (String(sql).includes("FROM transactions") && String(sql).includes("recurring_rule_id")) {
        return {
          rows: [
            {
              recurring_rule_id: 11,
              txn_date: "2026-07-24"
            }
          ]
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const rows = await getProjectedTransactions({
      from: "2026-07-24",
      to: "2026-07-24"
    });

    expect(rows).toHaveLength(0);
  });

  it("returns paired projected rows for a recurring transfer", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 12,
              name: "Move Savings",
              amount: "250.00",
              type: "transfer",
              cadence: "monthly",
              start_date: "2026-07-24",
              end_date: null,
              account_id: null,
              category_id: null,
              from_account_id: 1,
              to_account_id: 2,
              from_account_name: "Checking",
              to_account_name: "Savings",
              future_amount: null,
              future_amount_start_date: null,
              semi_month_day_1: null,
              semi_month_day_2: null,
              account_name: null,
              category_name: null
            }
          ]
        };
      }
      if (String(sql).includes("FROM recurring_modifications")) {
        return { rows: [] };
      }
      if (String(sql).includes("FROM transactions") && String(sql).includes("recurring_rule_id")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const rows = await getProjectedTransactions({
      from: "2026-07-24",
      to: "2026-07-24"
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.type).sort()).toEqual(["expense", "income"]);
    expect(rows.every((row) => row.recurring_rule_id === 12)).toBe(true);
  });

  it("returns only the matching projected transfer leg for an account filter", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 12,
              name: "Move Savings",
              amount: "250.00",
              type: "transfer",
              cadence: "monthly",
              start_date: "2026-07-24",
              end_date: null,
              account_id: null,
              category_id: null,
              from_account_id: 1,
              to_account_id: 2,
              from_account_name: "Checking",
              to_account_name: "Savings",
              future_amount: null,
              future_amount_start_date: null,
              semi_month_day_1: null,
              semi_month_day_2: null,
              account_name: null,
              category_name: null
            }
          ]
        };
      }
      if (String(sql).includes("FROM recurring_modifications")) {
        return { rows: [] };
      }
      if (String(sql).includes("FROM transactions") && String(sql).includes("recurring_rule_id")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const sourceRows = await getProjectedTransactions({
      from: "2026-07-24",
      to: "2026-07-24",
      account_id: "1"
    });
    expect(sourceRows).toHaveLength(1);
    expect(sourceRows[0].type).toBe("expense");
    expect(sourceRows[0].account_id).toBe(1);

    const destinationRows = await getProjectedTransactions({
      from: "2026-07-24",
      to: "2026-07-24",
      account_id: "2"
    });
    expect(destinationRows).toHaveLength(1);
    expect(destinationRows[0].type).toBe("income");
    expect(destinationRows[0].account_id).toBe(2);
  });
});
