import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { archiveScheduleEntry, archivedScheduleKeys } from "../lib/archive.js";
import { stampEdit } from "../lib/editStamp.js";

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
  // Dates an admin removed (now in the Archive) must not be re-created.
  for (const k of archivedScheduleKeys()) existing.add(k);

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

// Admin or doctor: post a new barangay mission date
router.post("/", requireRole("admin", "doctor"), (req, res) => {
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
  stampEdit("barangay_schedule", info.lastInsertRowid, req.user);
  const row = db.prepare("SELECT * FROM barangay_schedule WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Admin or doctor: edit a schedule entry — used to fix a mistake on an already
// posted date (wrong barangay, dentist, target headcount, status, etc.)
// without having to delete and re-add it. Only the fields that are sent are
// changed; barangay_name and visit_date can't be blanked, but the optional
// text fields (time, activity, dentist, location, notes) can be cleared by
// sending an empty value.
router.patch("/:id", requireRole("admin", "doctor"), (req, res) => {
  const existing = db.prepare("SELECT * FROM barangay_schedule WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Schedule entry not found." });

  const { barangay_name, visit_date, time_range, services, location, dentist, notes, target, status } = req.body;
  if (status !== undefined && !STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(", ")}` });
  }

  const optional = (incoming, current) => (incoming === undefined ? current : String(incoming ?? "").trim() || null);

  db.prepare(
    `UPDATE barangay_schedule SET
       barangay_name = ?, visit_date = ?, time_range = ?, services = ?,
       location = ?, dentist = ?, notes = ?, target = ?, status = ?
     WHERE id = ?`
  ).run(
    String(barangay_name ?? "").trim() || existing.barangay_name,
    String(visit_date ?? "").trim() || existing.visit_date,
    optional(time_range, existing.time_range),
    optional(services, existing.services),
    optional(location, existing.location),
    optional(dentist, existing.dentist),
    optional(notes, existing.notes),
    target === undefined ? existing.target : target === "" || target === null ? null : Math.max(0, Math.round(Number(target)) || 0),
    status || existing.status,
    existing.id
  );
  stampEdit("barangay_schedule", existing.id, req.user);
  res.json(db.prepare("SELECT * FROM barangay_schedule WHERE id = ?").get(existing.id));
});

// Admin only: "remove" a schedule entry — it goes to the Archive and can be
// restored from there.
router.delete("/:id", requireRole("admin"), (req, res) => {
  const ok = archiveScheduleEntry(Number(req.params.id), req.user);
  if (!ok) return res.status(404).json({ error: "Schedule entry not found." });
  res.json({ ok: true });
});

export default router;