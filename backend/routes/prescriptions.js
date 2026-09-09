import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const patientId = req.user.role === "admin" ? Number(req.query.patient_id) : req.user.id;
  if (req.user.role === "admin" && !patientId) {
    return res.status(400).json({ error: "patient_id query param required for admin." });
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
