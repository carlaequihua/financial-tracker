import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../src/db/query.js", () => ({
  query: (...args) => queryMock(...args)
}));

import { materializeDueRecurringTransactions } from "../src/services/recurringMaterializationService.js";

describe("materializeDueRecurringTransactions", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("inserts a due recurring occurrence once", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 5,
              name: "Rent",
              amount: "1200.00",
              type: "expense",
              cadence: "monthly",
              start_date: "2026-01-10",
              end_date: null,
              account_id: 1,
              category_id: 2,
              future_amount: null,
              future_amount_start_date: null,
              semi_month_day_1: null,
              semi_month_day_2: null
            }
          ]
        };
      }
      if (sql.includes("FROM transactions") && sql.includes("recurring_rule_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM recurring_modifications")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO transactions")) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await materializeDueRecurringTransactions({ cutoffDate: "2026-01-15" });

    expect(result.inserted).toBe(1);
    const insertCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO transactions"));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toEqual([
      "2026-01-10",
      "Rent",
      1200,
      "expense",
      1,
      2,
      5
    ]);
  });

  it("does not insert when the recurring occurrence already exists", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 5,
              name: "Rent",
              amount: "1200.00",
              type: "expense",
              cadence: "monthly",
              start_date: "2026-01-10",
              end_date: null,
              account_id: 1,
              category_id: 2,
              future_amount: null,
              future_amount_start_date: null,
              semi_month_day_1: null,
              semi_month_day_2: null
            }
          ]
        };
      }
      if (sql.includes("FROM transactions") && sql.includes("recurring_rule_id")) {
        return {
          rows: [
            { recurring_rule_id: 5, txn_date: "2026-01-10" }
          ]
        };
      }
      if (sql.includes("FROM recurring_modifications")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO transactions")) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await materializeDueRecurringTransactions({ cutoffDate: "2026-01-15" });

    expect(result.inserted).toBe(0);
    const insertCalls = queryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO transactions"));
    expect(insertCalls).toHaveLength(0);
  });

  it("does not insert when the occurrence is marked deleted by one-time modification", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 5,
              name: "Rent",
              amount: "1200.00",
              type: "expense",
              cadence: "monthly",
              start_date: "2026-01-10",
              end_date: null,
              account_id: 1,
              category_id: 2,
              future_amount: null,
              future_amount_start_date: null,
              semi_month_day_1: null,
              semi_month_day_2: null
            }
          ]
        };
      }
      if (sql.includes("FROM transactions") && sql.includes("recurring_rule_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM recurring_modifications")) {
        return {
          rows: [
            {
              id: 99,
              recurring_rule_id: 5,
              modification_type: "one_time",
              start_date: "2026-01-10",
              end_date: null,
              amount: null,
              description: null,
              account_id: null,
              category_id: null,
              override_txn_date: null,
              is_deleted: true
            }
          ]
        };
      }
      if (sql.includes("INSERT INTO transactions")) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await materializeDueRecurringTransactions({ cutoffDate: "2026-01-15" });

    expect(result.inserted).toBe(0);
    const insertCalls = queryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO transactions"));
    expect(insertCalls).toHaveLength(0);
  });

  it("inserts a recurring transfer as paired transactions", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.includes("FROM recurring_entries")) {
        return {
          rows: [
            {
              id: 8,
              name: "Move Savings",
              amount: "250.00",
              type: "transfer",
              cadence: "monthly",
              start_date: "2026-01-10",
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
              semi_month_day_2: null
            }
          ]
        };
      }
      if (sql.includes("FROM transactions") && sql.includes("recurring_rule_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM recurring_modifications")) {
        return { rows: [] };
      }
      if (String(sql).includes("WITH outgoing AS")) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await materializeDueRecurringTransactions({ cutoffDate: "2026-01-15" });

    expect(result.inserted).toBe(2);
    const transferInsertCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("WITH outgoing AS"));
    expect(transferInsertCall).toBeTruthy();
  });
});
