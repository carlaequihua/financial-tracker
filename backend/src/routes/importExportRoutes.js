import { Router } from "express";
import multer from "multer";
import {
  importTransactionsCsv,
  importTransactionsXlsx,
  exportTransactionsCsv,
  exportTransactionsXlsx,
  clearAllData,
  clearAllTransactions
} from "../services/importExportService.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/import/transactions", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const format = String(req.query.format || "csv").toLowerCase();
    let result;
    if (format === "xlsx") {
      result = await importTransactionsXlsx(req.file.buffer);
    } else {
      const text = req.file.buffer.toString("utf8");
      result = await importTransactionsCsv(text);
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get("/export/transactions", async (req, res, next) => {
  try {
    const format = String(req.query.format || "csv").toLowerCase();
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;

    if (format === "xlsx") {
      const buffer = await exportTransactionsXlsx(from, to);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", "attachment; filename=transactions.xlsx");
      res.send(buffer);
      return;
    }

    const csv = await exportTransactionsCsv(from, to);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=transactions.csv");
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

router.post("/clear-all", async (req, res, next) => {
  try {
    const result = await clearAllData();
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/clear-transactions", async (req, res, next) => {
  try {
    const result = await clearAllTransactions();
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
