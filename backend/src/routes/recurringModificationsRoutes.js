import { Router } from "express";
import {
  listModifications,
  createModification,
  updateModification,
  deleteModification
} from "../services/recurringModificationsService.js";

const router = Router();

router.get("/:recurringRuleId/modifications", async (req, res, next) => {
  try {
    const mods = await listModifications(Number(req.params.recurringRuleId));
    res.json(mods);
  } catch (e) {
    next(e);
  }
});

router.post("/:recurringRuleId/modifications", async (req, res, next) => {
  try {
    const created = await createModification({
      ...req.body,
      recurring_rule_id: Number(req.params.recurringRuleId)
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.put("/modifications/:modId", async (req, res, next) => {
  try {
    const updated = await updateModification(Number(req.params.modId), req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/modifications/:modId", async (req, res, next) => {
  try {
    const ok = await deleteModification(Number(req.params.modId));
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
