import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getDoctorAccessiblePatientIds } from "../lib/doctorMatch.js";
import { stampEdit } from "../lib/editStamp.js";

const router = Router();
router.use(requireAuth);

// Standard adult (permanent) dentition, FDI two-digit notation, arranged
// upper-right → upper-left, then lower-left → lower-right — the order the
// chart is drawn in.
export const UPPER_RIGHT = ["18", "17", "16", "15", "14", "13", "12", "11"];
export const UPPER_LEFT = ["21", "22", "23", "24", "25", "26", "27", "28"];
export const LOWER_LEFT = ["31", "32", "33", "34", "35", "36", "37", "38"];
export const LOWER_RIGHT = ["41", "42", "43", "44", "45", "46", "47", "48"];
export const ALL_TEETH = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_RIGHT, ...LOWER_LEFT];

// GET a patient's full 32-tooth chart. Teeth with no row yet default to "sound".
// Viewable by: admin (any patient), the patient themself, or a doctor
// viewing one of their own patients (see lib/doctorMatch.js) -- same
// ownership rule as patients.js's GET /:id.
router.get("/:patientId/tooth-chart", (req, res) => {
  const patientId = Number(req.params.patientId);
  const isAdmin = req.user.role === "admin";
  const isOwnAccount = req.user.id === patientId;
  const isTheirPatient = req.user.role === "doctor" && getDoctorAccessiblePatientIds(db, req.user).has(patientId);
  if (!isAdmin && !isOwnAccount && !isTheirPatient) {
    return res.status(403).json({ error: "Not authorized." });
  }

  // record_id = the service record (visit) that set this tooth, or null if it
  // wasn't tied to one (older data) or that record no longer exists.
  const rows = db
    .prepare(
      `SELECT tc.tooth_number, tc.condition, tc.treatment_note, dr.id AS record_id
         FROM tooth_conditions tc
         LEFT JOIN dental_records dr ON dr.id = tc.record_id AND dr.patient_id = tc.patient_id
        WHERE tc.patient_id = ?`
    )
    .all(patientId);
  const byTooth = new Map(rows.map((r) => [r.tooth_number, r]));

  const chart = ALL_TEETH.map((tooth_number) => ({
    tooth_number,
    condition: byTooth.get(tooth_number)?.condition || "sound",
    treatment_note: byTooth.get(tooth_number)?.treatment_note || "",
    record_id: byTooth.get(tooth_number)?.record_id ?? null,
  }));

  const dmft = chart.filter((t) => ["decayed", "missing", "filled"].includes(t.condition)).length;

  res.json({ chart, dmft });
});

// Admin or doctor (their own patients): set one tooth's condition (upsert).
router.patch("/:patientId/tooth-chart/:toothNumber", requireRole("admin", "doctor"), (req, res) => {
  const patientId = Number(req.params.patientId);
  if (req.user.role === "doctor" && !getDoctorAccessiblePatientIds(db, req.user).has(patientId)) {
    return res.status(403).json({ error: "You can only edit your own patients." });
  }
  const { toothNumber } = req.params;
  const { condition, treatment_note, record_id } = req.body;

  if (!ALL_TEETH.includes(toothNumber)) {
    return res.status(400).json({ error: "Invalid tooth number." });
  }
  const validConditions = ["sound", "decayed", "filled", "for_extraction", "missing"];
  if (!validConditions.includes(condition)) {
    return res.status(400).json({ error: "Invalid condition." });
  }

  // record_id (optional) = "this change belongs to that service record". It's
  // sent when an existing record is being edited, or for a new patient's first
  // record. Without it the change is "pending" (record_id NULL) until
  // POST /dental-records attaches it to the record being added.
  let recordId = null;
  if (record_id !== undefined && record_id !== null) {
    const record = db.prepare("SELECT id FROM dental_records WHERE id = ? AND patient_id = ?").get(Number(record_id), patientId);
    if (!record) return res.status(400).json({ error: "That service record doesn't belong to this patient." });
    recordId = record.id;

    // A tooth that another visit already recorded can't be changed from this one.
    const existing = db
      .prepare(
        `SELECT tc.condition, dr.id AS owner
           FROM tooth_conditions tc
           LEFT JOIN dental_records dr ON dr.id = tc.record_id AND dr.patient_id = tc.patient_id
          WHERE tc.patient_id = ? AND tc.tooth_number = ?`
      )
      .get(patientId, toothNumber);
    if (existing && existing.owner && existing.owner !== recordId && existing.condition !== "sound") {
      return res.status(409).json({ error: `Tooth ${toothNumber} was recorded in another visit, so it can't be changed in this record.` });
    }
  }

  db.prepare(
    `INSERT INTO tooth_conditions (patient_id, tooth_number, condition, treatment_note, record_id, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(patient_id, tooth_number)
     DO UPDATE SET condition = excluded.condition, treatment_note = excluded.treatment_note,
                   record_id = excluded.record_id, updated_at = datetime('now')`
  ).run(patientId, toothNumber, condition, treatment_note || null, recordId);
  stampEdit("users", patientId, req.user);

  res.json({ tooth_number: toothNumber, condition, treatment_note: treatment_note || "", record_id: recordId });
});

export default router;