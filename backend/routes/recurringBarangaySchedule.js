import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { archiveRotation } from "../lib/archive.js";
import { stampEdit } from "../lib/editStamp.js";

const router = Router();
// Admin AND doctor: the Doctor Portal's Barangay Schedule page is not
// read-only (see App.jsx), so it loads and manages weekly rotation rules
// the same way the admin's does.
router.use(requireAuth, requireRole("admin", "doctor"));

// GET /api/recurring-schedule — list all rotation rules (paused ones included)
router.get("/", (req, res) => {
  const rows = db.prepare(`SELECT * FROM recurring_barangay_schedule ORDER BY day_of_week ASC, barangay_name ASC`).all();
  res.json(rows);
});

// POST /api/recurring-schedule — e.g. { barangay_name: "Camaysa", day_of_week: 1, dentist: "Dr. Anthony Orias" }
router.post("/", (req, res) => {
  const { barangay_name, day_of_week, dentist, services, time_range, location, target, notes } = req.body;
  if (!barangay_name || day_of_week === undefined || day_of_week === null) {
    return res.status(400).json({ error: "barangay_name and day_of_week are required." });
  }
  const dow = Number(day_of_week);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
    return res.status(400).json({ error: "day_of_week must be 0 (Sunday) through 6 (Saturday)." });
  }
  const safeTarget = target === "" || target === undefined || target === null ? null : Math.max(0, Math.round(Number(target)) || 0);
  const info = db
    .prepare(
      `INSERT INTO recurring_barangay_schedule (barangay_name, day_of_week, dentist, services, time_range, location, target, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(barangay_name, dow, dentist || null, services || null, time_range || null, location || null, safeTarget, notes || null);
  stampEdit("recurring_barangay_schedule", info.lastInsertRowid, req.user);
  const row = db.prepare(`SELECT * FROM recurring_barangay_schedule WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(row);
});

// PATCH /api/recurring-schedule/:id — edit a rule, or set { active: 0 } to pause it.
// Only the fields that are sent are changed. Editing a rule affects dates the
// rotation adds from now on; dates already posted on the schedule keep their
// own details (edit those individually).
router.patch("/:id", (req, res) => {
  const existing = db.prepare(`SELECT * FROM recurring_barangay_schedule WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Rotation rule not found." });

  const { barangay_name, day_of_week, dentist, services, time_range, location, target, notes, active } = req.body;

  let dow = existing.day_of_week;
  if (day_of_week !== undefined && day_of_week !== null && day_of_week !== "") {
    dow = Number(day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return res.status(400).json({ error: "day_of_week must be 0 (Sunday) through 6 (Saturday)." });
    }
  }
  const optional = (incoming, current) => (incoming === undefined ? current : String(incoming ?? "").trim() || null);

  db.prepare(
    `UPDATE recurring_barangay_schedule SET
       barangay_name = ?, day_of_week = ?, dentist = ?, services = ?,
       time_range = ?, location = ?, target = ?, notes = ?, active = ?
     WHERE id = ?`
  ).run(
    String(barangay_name ?? "").trim() || existing.barangay_name,
    dow,
    optional(dentist, existing.dentist),
    optional(services, existing.services),
    optional(time_range, existing.time_range),
    optional(location, existing.location),
    target === undefined ? existing.target : target === "" || target === null ? null : Math.max(0, Math.round(Number(target)) || 0),
    optional(notes, existing.notes),
    active === undefined ? existing.active : active ? 1 : 0,
    existing.id
  );
  stampEdit("recurring_barangay_schedule", existing.id, req.user);
  res.json(db.prepare(`SELECT * FROM recurring_barangay_schedule WHERE id = ?`).get(existing.id));
});

// DELETE /api/recurring-schedule/:id — moves the rotation rule to the Archive.
// removeFuture=true also archives any not-yet-happened schedule rows this
// rule generated, so turning off a rotation doesn't leave upcoming dates behind.
// Admin only — doctors can pause/resume and edit a rotation, not archive it.
router.delete("/:id", requireRole("admin"), (req, res) => {
  const ok = archiveRotation(Number(req.params.id), req.query.removeFuture === "true", req.user);
  if (!ok) return res.status(404).json({ error: "Rotation rule not found." });
  res.json({ ok: true });
});

export default router;