import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();

vi.mock("../src/db/query.js", () => ({
  query: (...args) => queryMock(...args)
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    connect: vi.fn(async () => ({
      query: (...args) => clientQueryMock(...args),
      release: releaseMock
    }))
  }
}));

vi.mock("../src/services/recurringMaterializationService.js", () => ({
  materializeDueRecurringTransactions: vi.fn(async () => ({ inserted: 0, scanned_rules: 0 }))
}));

import { deleteTransaction } from "../src/services/transactionsService.js";

describe("transactionsService.deleteTransaction", () => {
  beforeEach(() => {
    queryMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
  });

  it("uses one_time start_date anchor when txn_date matches override_txn_date", async () => {
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).startsWith("SELECT id, txn_date, cleared, transfer_pair_id, recurring_rule_id, is_one_time FROM transactions WHERE id = $1")) {
        return {
          rows: [
            {
              id: 44,
              txn_date: "2026-07-18",
              cleared: false,
              transfer_pair_id: null,
              recurring_rule_id: 7,
              is_one_time: false
            }
          ]
        };
      }
      return { rows: [], rowCount: 0 };
    });

    clientQueryMock.mockImplementation(async (sql, params) => {
      if (String(sql) === "BEGIN" || String(sql) === "COMMIT") {
        return { rowCount: 0, rows: [] };
      }
      if (String(sql).includes("SELECT start_date") && String(sql).includes("override_txn_date")) {
        return { rows: [{ start_date: "2026-07-15" }], rowCount: 1 };
      }
      if (String(sql).includes("UPDATE recurring_modifications") && String(sql).includes("is_deleted = true")) {
        expect(params).toEqual([7, "2026-07-15"]);
        return { rows: [], rowCount: 1 };
      }
      if (String(sql).startsWith("DELETE FROM transactions WHERE id = $1")) {
        return { rows: [], rowCount: 1 };
      }
      if (String(sql) === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const ok = await deleteTransaction(44);

    expect(ok).toBe(true);
    const insertCalls = clientQueryMock.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO recurring_modifications"));
    expect(insertCalls).toHaveLength(0);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
