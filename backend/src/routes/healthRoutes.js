import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({ ok: true, service: "fin-carla-backend" });
});

export default router;
