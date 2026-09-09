import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const WEEKS_TO_GENERATE = 8; // how far ahead recurring rules get filled in

// Turns active recurring rules ("every Monday in Camaysa") into real rows in
// barangay_schedule for the next few weeks, skipping any date that already
// has a row for that barangay (so a manual edit/override is never clobbered).
function generateFromRecurringRules() {
  const rules = db.prepare(`SELECT * FROM recurring_barangay_schedule WHERE active = 1`).all();
  if (!rules.length) return;

  const existing = new Set(
    db
      .prepare(`SELECT barangay_name || '|' || visit_date AS k FROM barangay_schedule`)
      .all()
      .map((r) => r.k)
  );

  const insert = db.prepare(
    `INSERT INTO barangay_schedule
       (barangay_name, visit_date, time_range, services, location, dentist, notes, target, status, recurring_rule_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Upcoming', ?)`
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const rule of rules) {
    for (let i = 0; i < WEEKS_TO_GENERATE * 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (d.getDay() !== rule.day_of_week) continue;
      const visit_date = d.toISOString().slice(0, 10);
      const key = `${rule.barangay_name}|${visit_date}`;
      if (existing.has(key)) continue;
      insert.run(
        rule.barangay_name,
        visit_date,
        rule.time_range || null,
        rule.services || null,
        rule.location || null,
        rule.dentist || null,
        rule.notes || null,
        rule.target,
        rule.id
      );
      existing.add(key);
    }
  }
}

// Anyone logged in (patient or admin) can view the schedule, soonest first — view only for patients.
router.get("/", (req, res) => {
  generateFromRecurringRules();
  const rows = db.prepare(`SELECT * FROM barangay_schedule ORDER BY visit_date ASC`).all();
  res.json(rows);
});

const STATUS_VALUES = ["Upcoming", "Ongoing", "Completed"];

// Admin only: post a new barangay mission date
router.post("/", requireRole("admin"), (req, res) => {
  const { barangay_name, visit_date, time_range, services, location, dentist, notes, target, status } = req.body;
  if (!barangay_name || !visit_date) {
    return res.status(400).json({ error: "barangay_name and visit_date are required." });
  }
  const safeStatus = STATUS_VALUES.includes(status) ? status : "Upcoming";
  const safeTarget = target === "" || target === undefined || target === null ? null : Math.max(0, Math.round(Number(target)) || 0);
  const info = db
    .prepare(
      `INSERT INTO barangay_schedule (barangay_name, visit_date, time_range, services, location, dentist, notes, target, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      barangay_name,
      visit_date,
      time_range || null,
      services || null,
      location || null,
      dentist || null,
      notes || null,
      safeTarget,
      safeStatus
    );
  const row = db.prepare("SELECT * FROM barangay_schedule WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Admin only: edit a schedule entry — used to fix a mistake on an already
// posted date (wrong barangay, dentist, target headcount, status, etc.)
// without having to delete and re-add it.
router.patch("/:id", requireRole("admin"), (req, res) => {
  const { barangay_name, visit_date, time_range, services, location, dentist, notes, target, status } = req.body;

  if (status !== undefined && !STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(", ")}` });
  }

  db.prepare(
    `UPDATE barangay_schedule SET
       barangay_name = COALESCE(?, barangay_name),
       visit_date = COALESCE(?, visit_date),
       time_range = COALESCE(?, time_range),
       services = COALESCE(?, services),
       location = COALESCE(?, location),
       dentist = COALESCE(?, dentist),
       notes = COALESCE(?, notes),
       target = CASE WHEN ? THEN ? ELSE target END,
       status = COALESCE(?, status)
     WHERE id = ?`
  ).run(
    barangay_name || null,
    visit_date || null,
    time_range || null,
    services || null,
    location || null,
    dentist || null,
    notes || null,
    target !== undefined ? 1 : 0,
    target === "" || target === null ? null : Math.max(0, Math.round(Number(target)) || 0),
    status || null,
    req.params.id
  );
  const row = db.prepare("SELECT * FROM barangay_schedule WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Schedule entry not found." });
  res.json(row);
});

// Admin only: remove a schedule entry
router.delete("/:id", requireRole("admin"), (req, res) => {
  db.prepare(`DELETE FROM barangay_schedule WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

export default router;
