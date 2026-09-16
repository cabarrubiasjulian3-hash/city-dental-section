import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getDoctorPatientIds } from "../lib/doctorMatch.js";

const router = Router();
router.use(requireAuth);

// Same fix as dentalRecords.js: a doctor was falling through to req.user.id
// (their own account id, not a patient's) instead of using the requested
// ?patient_id=, so this always came back empty for a doctor no matter whose
// profile was open.
router.get("/", (req, res) => {
  const isStaff = req.user.role === "admin" || req.user.role === "doctor";
  const patientId = isStaff ? Number(req.query.patient_id) : req.user.id;
  if (isStaff && !patientId) {
    return res.status(400).json({ error: "patient_id query param required." });
  }
  if (req.user.role === "doctor" && !getDoctorPatientIds(db, req.user.name).has(patientId)) {
    return res.status(403).json({ error: "You can only view prescriptions for your own patients." });
  }
  const rows = db
    .prepare(`SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY prescribed_at DESC`)
    .all(patientId);
  res.json(rows);
});

router.post("/", requireRole("admin"), (req, res) => {
  const { patient_id, medicine, dosage, instructions, prescribed_by } = req.body;
  if (!patient_id || !medicine) {
    return res.status(400).json({ error: "patient_id and medicine are required." });
  }
  const info = db
    .prepare(
      `INSERT INTO prescriptions (patient_id, medicine, dosage, instructions, prescribed_by) VALUES (?, ?, ?, ?, ?)`
    )
    .run(patient_id, medicine, dosage || null, instructions || null, prescribed_by || null);
  const row = db.prepare("SELECT * FROM prescriptions WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

export default router;