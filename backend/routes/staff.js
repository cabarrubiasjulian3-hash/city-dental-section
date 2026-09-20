import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { archiveStaff } from "../lib/archive.js";

const router = Router();
router.use(requireAuth);

// Viewable by admin and doctor (the "Dentist" dropdown when adding a
// record needs this for admin too). Staff Management now lives in the
// Doctor Portal, so adding, editing and removing staff is doctor-only.
// "Remove" moves the person to the Archive (admin can restore from there).
router.get("/", requireRole("admin", "doctor"), (req, res) => {
  res.json(db.prepare(`SELECT * FROM staff ORDER BY name ASC`).all());
});

router.post("/", requireRole("doctor"), (req, res) => {
  const { name, role, email, phone, schedule } = req.body;
  if (!name || !role) return res.status(400).json({ error: "name and role are required." });
  const info = db
    .prepare(`INSERT INTO staff (name, role, email, phone, schedule) VALUES (?, ?, ?, ?, ?)`)
    .run(name, role, email || null, phone || null, schedule || null);
  res.status(201).json(db.prepare("SELECT * FROM staff WHERE id = ?").get(info.lastInsertRowid));
});

router.patch("/:id", requireRole("doctor"), (req, res) => {
  const existing = db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Staff member not found." });

  const { name, role, email, phone, schedule } = req.body;
  // name/role are required, so a blank value keeps the old one. email,
  // phone and schedule are optional, so sending "" clears them.
  const optional = (incoming, current) => (incoming === undefined ? current : String(incoming).trim() || null);

  db.prepare(`UPDATE staff SET name=?, role=?, email=?, phone=?, schedule=? WHERE id=?`).run(
    String(name ?? "").trim() || existing.name,
    String(role ?? "").trim() || existing.role,
    optional(email, existing.email),
    optional(phone, existing.phone),
    optional(schedule, existing.schedule),
    existing.id
  );
  res.json(db.prepare("SELECT * FROM staff WHERE id = ?").get(existing.id));
});

router.delete("/:id", requireRole("doctor"), (req, res) => {
  const ok = archiveStaff(Number(req.params.id), req.user);
  if (!ok) return res.status(404).json({ error: "Staff member not found." });
  res.json({ ok: true });
});

export default router;