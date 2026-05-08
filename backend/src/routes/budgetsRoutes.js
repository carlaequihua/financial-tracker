import { Router } from "express";
import {
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetAlerts
} from "../services/budgetsService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    res.json(await listBudgets());
  } catch (e) {
    next(e);
  }
});

router.get("/alerts", async (req, res, next) => {
  try {
    const now = new Date();
    const month = Number(req.query.month || now.getMonth() + 1);
    const year = Number(req.query.year || now.getFullYear());
    res.json(await getBudgetAlerts(month, year));
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const created = await createBudget(req.body);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const updated = await updateBudget(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const ok = await deleteBudget(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
