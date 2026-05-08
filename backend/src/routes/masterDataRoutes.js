import { Router } from "express";
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  reorderAccount,
  setAccountsOrder,
  listSummary,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from "../services/masterDataService.js";

const router = Router();

router.get("/summary", async (req, res, next) => {
  try {
    res.json(await listSummary());
  } catch (e) {
    next(e);
  }
});

router.get("/accounts", async (req, res, next) => {
  try {
    res.json(await listAccounts());
  } catch (e) {
    next(e);
  }
});

router.post("/accounts", async (req, res, next) => {
  try {
    const created = await createAccount(req.body);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.put("/accounts/:id", async (req, res, next) => {
  try {
    const updated = await updateAccount(Number(req.params.id), req.body);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/accounts/:id", async (req, res, next) => {
  try {
    const ok = await deleteAccount(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

router.post("/accounts/:id/reorder", async (req, res, next) => {
  try {
    const result = await reorderAccount(Number(req.params.id), String(req.body?.direction || ""));
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/accounts/reorder", async (req, res, next) => {
  try {
    const result = await setAccountsOrder(req.body?.accountIds);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get("/categories", async (req, res, next) => {
  try {
    res.json(await listCategories());
  } catch (e) {
    next(e);
  }
});

router.post("/categories", async (req, res, next) => {
  try {
    const created = await createCategory(req.body.name);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.put("/categories/:id", async (req, res, next) => {
  try {
    const updated = await updateCategory(Number(req.params.id), req.body.name);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const ok = await deleteCategory(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
