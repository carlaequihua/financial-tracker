import { describe, it, expect, vi, beforeEach } from "vitest";

const transactionInserts = [];
const accountMap = new Map();
let nextAccountId = 1;

vi.mock("../src/db/query.js", () => ({
  query: vi.fn(async (sql, params) => {
    if (sql.includes("INSERT INTO accounts")) {
      const name = params[0];
      if (!accountMap.has(name)) accountMap.set(name, nextAccountId++);
      return { rows: [{ id: accountMap.get(name) }] };
    }

    if (sql.includes("INSERT INTO categories")) {
      return { rows: [{ id: 1 }] };
    }

    if (sql.includes("INSERT INTO transactions")) {
      transactionInserts.push(params);
      return { rows: [] };
    }

    return { rows: [] };
  })
}));

import { importTransactionsCsv } from "../src/services/importExportService.js";

describe("importExportService wide-format CSV import", () => {
  beforeEach(() => {
    transactionInserts.length = 0;
    accountMap.clear();
    nextAccountId = 1;
  });

  it("imports timeline-style rows and maps account columns", async () => {
    const csv = [
      "3/26/1900,500,$0.00,,,,",
      "Date,Expenditure Location,Expenditure Amount,BofA Balance,Chase Balance,Shared Marcus HYSA,Shared Chase,Macus HYSA,Cash,Cashflow",
      ',,,"$5,980.14",$420.79,,,,',
      "4/15/2020,Toyota Financial,$337.04,\"$5,643.10\",,,,,,",
      "4/15/2020,Move,\"-$1,200.00\",\"$5,643.10\",\"$1,620.79\",,,,,",
      "4/16/2020,,\"$927.62\",\"$6,570.72\",,,,,,"
    ].join("\n");

    const result = await importTransactionsCsv(csv);

    expect(result.total).toBe(4);
    expect(result.inserted).toBe(3);
    expect(result.failed).toBe(3);
    expect(result.skipped).toBe(3);

    expect(accountMap.has("BofA Balance")).toBe(true);
    expect(accountMap.has("Chase Balance")).toBe(true);

    expect(transactionInserts).toHaveLength(3);

    const firstInsert = transactionInserts[0];
    expect(firstInsert[0]).toBe("2020-04-15");
    expect(firstInsert[1]).toBe("Toyota Financial");
    expect(firstInsert[2]).toBe(337.04);

    const secondInsert = transactionInserts[1];
    expect(secondInsert[1]).toBe("Move");
    expect(secondInsert[2]).toBe(1200);

    const thirdInsert = transactionInserts[2];
    expect(thirdInsert[1]).toBe("Move");
    expect(thirdInsert[2]).toBe(1200);
  });
});
