import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

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
  const row = db.prepare(`SELECT * FROM recurring_barangay_schedule WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(row);
});

// PATCH /api/recurring-schedule/:id — edit a rule, or set { active: 0 } to pause it
router.patch("/:id", (req, res) => {
  const { barangay_name, day_of_week, dentist, services, time_range, location, target, notes, active } = req.body;
  db.prepare(
    `UPDATE recurring_barangay_schedule SET
       barangay_name = COALESCE(?, barangay_name),
       day_of_week = COALESCE(?, day_of_week),
       dentist = COALESCE(?, dentist),
       services = COALESCE(?, services),
       time_range = COALESCE(?, time_range),
       location = COALESCE(?, location),
       target = CASE WHEN ? THEN ? ELSE target END,
       notes = COALESCE(?, notes),
       active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    barangay_name || null,
    day_of_week === undefined || day_of_week === null ? null : Number(day_of_week),
    dentist || null,
    services || null,
    time_range || null,
    location || null,
    target !== undefined ? 1 : 0,
    target === "" || target === null ? null : Math.max(0, Math.round(Number(target)) || 0),
    notes || null,
    active === undefined ? null : (active ? 1 : 0),
    req.params.id
  );
  const row = db.prepare(`SELECT * FROM recurring_barangay_schedule WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Rotation rule not found." });
  res.json(row);
});

// DELETE /api/recurring-schedule/:id
// removeFuture=true also deletes any not-yet-happened schedule rows this rule generated,
// so turning off a rotation doesn't leave orphaned upcoming dates behind.
router.delete("/:id", (req, res) => {
  if (req.query.removeFuture === "true") {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(
      `DELETE FROM barangay_schedule WHERE recurring_rule_id = ? AND visit_date >= ? AND status != 'Completed'`
    ).run(req.params.id, today);
  }
  db.prepare(`DELETE FROM recurring_barangay_schedule WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

export default router;