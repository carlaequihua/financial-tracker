import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../src/services/transactionsService.js", () => ({
  listTransactions: vi.fn(async () => [{ id: 1, description: "Mock txn" }]),
  createTransaction: vi.fn(async (body) => ({ id: 2, ...body })),
  updateTransaction: vi.fn(async (id, body) => ({ id: Number(id), ...body })),
  deleteTransaction: vi.fn(async () => true),
  setTransactionCleared: vi.fn(async (id, cleared) => ({ id: Number(id), cleared: Boolean(cleared) }))
}));

vi.mock("../src/services/importExportService.js", () => ({
  importTransactionsCsv: vi.fn(async () => ({ inserted: 1, skipped: 0, total: 1 })),
  importTransactionsXlsx: vi.fn(async () => ({ inserted: 2, skipped: 0, total: 2 })),
  exportTransactionsCsv: vi.fn(async () => "id,description\n1,test"),
  exportTransactionsXlsx: vi.fn(async () => Buffer.from("xlsx")),
  clearAllData: vi.fn(async () => ({ ok: true })),
  clearAllTransactions: vi.fn(async () => ({ ok: true }))
}));

import { createApp } from "../src/app.js";

describe("API smoke tests", () => {
  const app = createApp();

  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /api/transactions", async () => {
    const res = await request(app).get("/api/transactions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/transactions with filters", async () => {
    const res = await request(app).get("/api/transactions?type=expense&cleared=false");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/transactions", async () => {
    const payload = {
      txn_date: "2026-05-01",
      description: "Coffee",
      amount: 4.5,
      type: "expense",
      cleared: false
    };
    const res = await request(app).post("/api/transactions").send(payload);
    expect(res.status).toBe(201);
    expect(res.body.description).toBe("Coffee");
  });

  it("PATCH /api/transactions/:id/cleared", async () => {
    const res = await request(app).patch("/api/transactions/1/cleared").send({ cleared: true });
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
  });

  it("GET /api/io/export/transactions csv", async () => {
    const res = await request(app).get("/api/io/export/transactions?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
  });

  it("GET /api/io/export/transactions xlsx", async () => {
    const res = await request(app).get("/api/io/export/transactions?format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("POST /api/io/import/transactions requires file", async () => {
    const res = await request(app).post("/api/io/import/transactions");
    expect(res.status).toBe(400);
  });

  it("POST /api/io/clear-transactions", async () => {
    const res = await request(app).post("/api/io/clear-transactions");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
