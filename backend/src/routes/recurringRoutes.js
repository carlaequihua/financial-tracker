import { Router } from "express";
import {
  listRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring
} from "../services/recurringService.js";
import { getUpcomingExpenses } from "../services/analyticsService.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    res.json(await listRecurring());
  } catch (e) {
    next(e);
  }
});

router.get("/upcoming-expenses", async (req, res, next) => {
  try {
    const days = Number(req.query.days || 30);
    res.json(await getUpcomingExpenses(days));
  } catch (e) {
    next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const created = await createRecurring(req.body);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const updated = await updateRecurring(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const ok = await deleteRecurring(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
