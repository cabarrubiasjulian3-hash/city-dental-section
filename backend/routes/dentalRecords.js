import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { SERVICES } from "../lib/services.js";
import { applyServiceRecord, revertServiceRecord } from "../lib/reportSync.js";
import { getDoctorAccessiblePatientIds } from "../lib/doctorMatch.js";
import { archiveServiceRecord } from "../lib/archive.js";
import { stampEdit } from "../lib/editStamp.js";
import { normalizePatientType } from "../lib/patientType.js";
import { calcAge } from "../lib/age.js";

// Falls back to a snapshot of the PATIENT's current PWD / Senior Citizen /
// Pregnant flags when the request didn't send its own patient_type (older
// clients, or the Excel import). Keeps the same "PWD,Pregnant" / "none"
// format the frontend uses (see typeSnapshot() in AdminPatients).
function currentPatientTypeSnapshot(patient) {
  const tags = [];
  if (patient?.is_pwd) tags.push("PWD");
  if (patient?.is_senior_citizen) tags.push("Senior");
  if (patient?.is_pregnant) tags.push("Pregnant");
  return tags.length ? tags.join(",") : "none";
}

const router = Router();
router.use(requireAuth);

// List records: patient sees own; admin or doctor passes ?patient_id=. A
// doctor is restricted to their own patients (see lib/doctorMatch.js) --
// the earlier version of this route only ever branched on role === "admin",
// so for a doctor patientId silently fell through to req.user.id (the
// DOCTOR's own account id, not a patient at all), meaning this always
// queried for records belonging to nobody and came back empty regardless
// of which patient's profile was actually open.
router.get("/", (req, res) => {
  const isStaff = req.user.role === "admin" || req.user.role === "doctor";
  const patientId = isStaff ? Number(req.query.patient_id) : req.user.id;
  if (isStaff && !patientId) {
    return res.status(400).json({ error: "patient_id query param required." });
  }
  if (req.user.role === "doctor" && !getDoctorAccessiblePatientIds(db, req.user).has(patientId)) {
    return res.status(403).json({ error: "You can only view records for your own patients." });
  }
  const rows = db
    .prepare(`SELECT * FROM dental_records WHERE patient_id = ? ORDER BY record_date DESC`)
    .all(patientId);
  res.json(rows);
});

// Admin or doctor adds a dental record for a patient (a doctor: one of their
// own patients). This also auto-tallies the visit into the e-FHSIS Monthly
// Report (by the patient's barangay, and by the attending dentist) — see
// lib/reportSync.js.
router.post("/", requireRole("admin", "doctor"), (req, res) => {
  const { patient_id, record_date, procedure, dentist, notes, teeth, patient_type } = req.body;
  if (req.user.role === "doctor" && !getDoctorAccessiblePatientIds(db, req.user).has(Number(patient_id))) {
    return res.status(403).json({ error: "You can only add records for your own patients." });
  }
  if (!patient_id || !record_date || !procedure) {
    return res.status(400).json({ error: "patient_id, record_date, and procedure are required." });
  }
  if (!SERVICES.includes(procedure)) {
    return res.status(400).json({ error: `procedure must be one of: ${SERVICES.join(", ")}` });
  }
  const patient = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'patient'").get(patient_id);
  if (!patient) return res.status(404).json({ error: "Patient not found." });

  // Frozen at the moment the visit is logged — a patient's Patient Type
  // changing later (e.g. no longer pregnant) must never rewrite this visit.
  // The Monthly Report tally below also uses this snapshot (not the patient's
  // current flags), so Reports match the type shown on the service record.
  const typeSnapshot =
    normalizePatientType(patient_type, patient, calcAge(patient.birthdate)) || currentPatientTypeSnapshot(patient);
  const snapshot = applyServiceRecord({ patient, recordDate: record_date, dentist, patientType: typeSnapshot });

  const info = db
    .prepare(
      `INSERT INTO dental_records
         (patient_id, record_date, procedure, dentist, notes, patient_type, report_month, report_field, report_barangay, report_dentist)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      patient_id,
      record_date,
      procedure,
      dentist || null,
      notes || null,
      typeSnapshot,
      snapshot.report_month,
      snapshot.report_field,
      snapshot.report_barangay,
      snapshot.report_dentist
    );
  // The teeth the admin changed on the Oral Health Chart while adding this
  // record belong to it — tie them to this visit so editing a different record
  // later can't change them (see routes/toothChart.js).
  if (Array.isArray(teeth) && teeth.length) {
    const tie = db.prepare("UPDATE tooth_conditions SET record_id = ? WHERE patient_id = ? AND tooth_number = ?");
    for (const tooth of teeth) if (typeof tooth === "string") tie.run(info.lastInsertRowid, Number(patient_id), tooth);
  }
  stampEdit("dental_records", info.lastInsertRowid, req.user);
  stampEdit("users", patient_id, req.user);
  const row = db.prepare("SELECT * FROM dental_records WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

// Admin or doctor edits an existing service/procedure record (spreadsheet-style
// inline edit; a doctor: on one of their own patients). If the visit date or
// attending dentist changes, the Monthly Report tally is reversed and
// re-applied so counts stay accurate.
router.patch("/:id", requireRole("admin", "doctor"), (req, res) => {
  const id = Number(req.params.id);
  const { record_date, procedure, dentist, notes, patient_type } = req.body;
  const existing = db.prepare("SELECT * FROM dental_records WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Record not found." });
  if (req.user.role === "doctor" && !getDoctorAccessiblePatientIds(db, req.user).has(existing.patient_id)) {
    return res.status(403).json({ error: "You can only edit records of your own patients." });
  }

  if (procedure !== undefined && !SERVICES.includes(procedure)) {
    return res.status(400).json({ error: `procedure must be one of: ${SERVICES.join(", ")}` });
  }

  const newDate = record_date ?? existing.record_date;
  const newDentist = dentist !== undefined ? dentist : existing.dentist;
  const patientRow = db.prepare("SELECT * FROM users WHERE id = ?").get(existing.patient_id);
  const newType =
    patient_type !== undefined
      ? normalizePatientType(patient_type, patientRow, calcAge(patientRow?.birthdate)) || existing.patient_type
      : existing.patient_type;
  const typeChanged = (newType || "") !== (existing.patient_type || "");
  // Date, dentist or Patient Type changed => the report tally is redone.
  const dateOrDentistChanged =
    newDate !== existing.record_date || (newDentist || "") !== (existing.dentist || "") || typeChanged;

  let snapshot = {
    report_month: existing.report_month,
    report_field: existing.report_field,
    report_barangay: existing.report_barangay,
    report_dentist: existing.report_dentist,
  };

  if (dateOrDentistChanged) {
    revertServiceRecord(existing);
    snapshot = applyServiceRecord({ patient: patientRow, recordDate: newDate, dentist: newDentist, patientType: newType });
  }

  // patient_type is only touched when the request explicitly sends it (an
  // admin/doctor deliberately correcting THIS visit's snapshot) — any other
  // edit (date, procedure, dentist, notes) leaves it exactly as it was.
  db.prepare(
    `UPDATE dental_records SET
       record_date = COALESCE(?, record_date),
       procedure = COALESCE(?, procedure),
       dentist = COALESCE(?, dentist),
       notes = COALESCE(?, notes),
       patient_type = COALESCE(?, patient_type),
       report_month = ?, report_field = ?, report_barangay = ?, report_dentist = ?
     WHERE id = ?`
  ).run(
    record_date ?? null,
    procedure ?? null,
    dentist ?? null,
    notes ?? null,
    newType ?? null,
    snapshot.report_month,
    snapshot.report_field,
    snapshot.report_barangay,
    snapshot.report_dentist,
    id
  );
  stampEdit("dental_records", id, req.user);
  stampEdit("users", existing.patient_id, req.user);

  const row = db.prepare("SELECT * FROM dental_records WHERE id = ?").get(id);
  res.json(row);
});

// "Delete" a service record = move it to the Archive (lib/archive.js), which
// also takes it back out of the Report tallies; restoring tallies it again.
// Admin only — doctors can edit records but not archive/delete them.
router.delete("/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM dental_records WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Record not found." });
  archiveServiceRecord(id, req.user);
  res.json({ success: true });
});

export default router;