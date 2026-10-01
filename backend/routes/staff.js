import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { archiveStaff } from "../lib/archive.js";
import { normalizeDoctorName } from "../lib/doctorMatch.js";

const router = Router();
router.use(requireAuth);

// A staff row and a login account are two different tables with their own
// auto-numbered ids, so the same person used to show up as e.g. ST-0001 here
// but TC-17545 in User Management. To keep the ID the same everywhere, each
// staff row is matched to the doctor/admin account of the same person (same
// email, or same name ignoring "Dr."/"Doctor") and gets that account's id as
// `account_id`. Staff with no login (e.g. a dental assistant) have
// account_id = null and keep their own ST- number.
function withAccountId(rows) {
  const accounts = db.prepare(`SELECT id, name, email FROM users WHERE role IN ('doctor', 'admin')`).all();
  const find = (s) => {
    const email = String(s.email || "").trim().toLowerCase();
    const name = normalizeDoctorName(s.name);
    const byEmail = email && accounts.find((a) => String(a.email || "").toLowerCase() === email);
    if (byEmail) return byEmail;
    return name ? accounts.find((a) => normalizeDoctorName(a.name) === name) : undefined;
  };
  const one = (s) => ({ ...s, account_id: find(s)?.id ?? null });
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}

// Viewable by admin and doctor (the "Dentist" dropdown when adding a
// record needs this for admin too). Staff Management now lives in the
// Doctor Portal, so adding, editing and removing staff is doctor-only.
// "Remove" moves the person to the Archive (admin can restore from there).
router.get("/", requireRole("admin", "doctor"), (req, res) => {
  res.json(withAccountId(db.prepare(`SELECT * FROM staff ORDER BY name ASC`).all()));
});

router.post("/", requireRole("doctor"), (req, res) => {
  const { name, role, email, phone, schedule } = req.body;
  if (!name || !role) return res.status(400).json({ error: "name and role are required." });
  const info = db
    .prepare(`INSERT INTO staff (name, role, email, phone, schedule) VALUES (?, ?, ?, ?, ?)`)
    .run(name, role, email || null, phone || null, schedule || null);
  res.status(201).json(withAccountId(db.prepare("SELECT * FROM staff WHERE id = ?").get(info.lastInsertRowid)));
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
  res.json(withAccountId(db.prepare("SELECT * FROM staff WHERE id = ?").get(existing.id)));
});

router.delete("/:id", requireRole("doctor"), (req, res) => {
  const ok = archiveStaff(Number(req.params.id), req.user);
  if (!ok) return res.status(404).json({ error: "Staff member not found." });
  res.json({ ok: true });
});

export default router;