import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", (req, res) => {
  res.json(db.prepare(`SELECT * FROM staff ORDER BY name ASC`).all());
});

router.post("/", (req, res) => {
  const { name, role, email, phone, schedule } = req.body;
  if (!name || !role) return res.status(400).json({ error: "name and role are required." });
  const info = db
    .prepare(`INSERT INTO staff (name, role, email, phone, schedule) VALUES (?, ?, ?, ?, ?)`)
    .run(name, role, email || null, phone || null, schedule || null);
  res.status(201).json(db.prepare("SELECT * FROM staff WHERE id = ?").get(info.lastInsertRowid));
});

router.patch("/:id", (req, res) => {
  const { name, role, email, phone, schedule } = req.body;
  db.prepare(
    `UPDATE staff SET name=COALESCE(?,name), role=COALESCE(?,role), email=COALESCE(?,email),
     phone=COALESCE(?,phone), schedule=COALESCE(?,schedule) WHERE id=?`
  ).run(name || null, role || null, email || null, phone || null, schedule || null, req.params.id);
  res.json(db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare(`DELETE FROM staff WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

export default router;
