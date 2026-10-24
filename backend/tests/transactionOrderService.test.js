import { beforeEach, describe, expect, it, vi } from "vitest";

const clientQuery = vi.fn();
const release = vi.fn();
const list = vi.fn();
const projected = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: { connect: vi.fn(async () => ({ query: clientQuery, release })) }
}));
vi.mock("../src/services/transactionsService.js", () => ({ listTransactions: (...args) => list(...args) }));
vi.mock("../src/services/analyticsService.js", () => ({ getProjectedTransactions: (...args) => projected(...args) }));

import { reorderTransaction } from "../src/services/transactionOrderService.js";

describe("same-date reordering", () => {
  const date = "2026-11-01";
  const request = { date, key: "transaction:2", target_key: "transaction:1", placement: "before" };

  beforeEach(() => {
    vi.clearAllMocks();
    clientQuery.mockResolvedValue({ rows: [] });
    list.mockResolvedValue([
      { id: 1, txn_date: new Date(`${date}T00:00:00Z`), account_id: 1 },
      { id: 2, txn_date: date, account_id: 2 }
    ]);
    projected.mockResolvedValue([]);
  });

  function savedKeys() {
    return clientQuery.mock.calls.find(([sql]) => sql.includes("INSERT INTO transaction_order"))?.[1]?.[0];
  }

  it("persists a move before its neighbor across accounts", async () => {
    await reorderTransaction(request);
    expect(savedKeys()).toEqual(["transaction:2", "transaction:1"]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("persists a move after its neighbor", async () => {
    await reorderTransaction({ ...request, key: "transaction:1", target_key: "transaction:2", placement: "after" });
    expect(savedKeys()).toEqual(["transaction:2", "transaction:1"]);
  });

  it("keeps non-visible same-date transactions when moving a filtered row", async () => {
    list.mockResolvedValue([1, 2, 3].map((id) => ({ id, txn_date: date })));
    await reorderTransaction({ ...request, key: "transaction:3" });
    expect(savedKeys()).toEqual(["transaction:3", "transaction:1", "transaction:2"]);
    expect(list).toHaveBeenCalledWith({ from: date, to: date });
  });

  it("persists projected rows using the stable recurring occurrence key", async () => {
    projected.mockResolvedValue([{ id: "projected-7-2026-11-01", txn_date: date, recurring_rule_id: 7, account_id: 1 }]);
    await reorderTransaction({ ...request, key: "recurring:7:2026-11-01:1" });
    expect(savedKeys()).toEqual(["recurring:7:2026-11-01:1", "transaction:1", "transaction:2"]);
  });

  it("includes scheduled dates for projected occurrences moved onto the selected date", async () => {
    clientQuery.mockImplementation(async (sql) => ({ rows: sql.includes("MIN(start_date)")
      ? [{ from_date: "2026-11-01", to_date: "2026-11-15" }] : [] }));
    await reorderTransaction(request);
    expect(projected).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-15" });
  });

  it("rejects a move between dates without writing an order", async () => {
    list.mockResolvedValue([{ id: 1, txn_date: date }, { id: 2, txn_date: "2026-11-02" }]);
    await expect(reorderTransaction(request)).rejects.toMatchObject({ status: 409 });
    expect(savedKeys()).toBeUndefined();
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    {}, null,
    { ...request, placement: "up" },
    { ...request, key: request.target_key },
    { ...request, date: "2026-02-31" }
  ])("rejects invalid requests: %s", async (input) => {
    await expect(reorderTransaction(input)).rejects.toMatchObject({ status: 400 });
    expect(savedKeys()).toBeUndefined();
  });

  it("rolls back and releases the connection if persistence fails", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO transaction_order")) throw new Error("database unavailable");
      return { rows: [] };
    });
    await expect(reorderTransaction(request)).rejects.toThrow("database unavailable");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});