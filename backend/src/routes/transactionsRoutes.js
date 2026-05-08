import { Router } from "express";
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  setTransactionCleared
} from "../services/transactionsService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const filters = {
      from: req.query.from,
      to: req.query.to,
      type: req.query.type,
      account_id: req.query.account_id,
      category_id: req.query.category_id,
      cleared: req.query.cleared === undefined ? undefined : req.query.cleared === "true"
    };
    res.json(await listTransactions(filters));
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const created = await createTransaction(req.body);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const updated = await updateTransaction(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const ok = await deleteTransaction(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/cleared", async (req, res, next) => {
  try {
    const updated = await setTransactionCleared(req.params.id, req.body?.cleared);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
