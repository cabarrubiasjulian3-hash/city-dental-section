import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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
router.get("/:patientId/tooth-chart", (req, res) => {
  const patientId = Number(req.params.patientId);
  if (req.user.role !== "admin" && req.user.id !== patientId) {
    return res.status(403).json({ error: "Not authorized." });
  }

  const rows = db
    .prepare("SELECT tooth_number, condition, treatment_note FROM tooth_conditions WHERE patient_id = ?")
    .all(patientId);
  const byTooth = new Map(rows.map((r) => [r.tooth_number, r]));

  const chart = ALL_TEETH.map((tooth_number) => ({
    tooth_number,
    condition: byTooth.get(tooth_number)?.condition || "sound",
    treatment_note: byTooth.get(tooth_number)?.treatment_note || "",
  }));

  const dmft = chart.filter((t) => ["decayed", "missing", "filled"].includes(t.condition)).length;

  res.json({ chart, dmft });
});

// Admin: set one tooth's condition (upsert).
router.patch("/:patientId/tooth-chart/:toothNumber", requireRole("admin"), (req, res) => {
  const patientId = Number(req.params.patientId);
  const { toothNumber } = req.params;
  const { condition, treatment_note } = req.body;

  if (!ALL_TEETH.includes(toothNumber)) {
    return res.status(400).json({ error: "Invalid tooth number." });
  }
  const validConditions = ["sound", "decayed", "filled", "for_extraction", "missing"];
  if (!validConditions.includes(condition)) {
    return res.status(400).json({ error: "Invalid condition." });
  }

  db.prepare(
    `INSERT INTO tooth_conditions (patient_id, tooth_number, condition, treatment_note, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(patient_id, tooth_number)
     DO UPDATE SET condition = excluded.condition, treatment_note = excluded.treatment_note, updated_at = datetime('now')`
  ).run(patientId, toothNumber, condition, treatment_note || null);

  res.json({ tooth_number: toothNumber, condition, treatment_note: treatment_note || "" });
});

export default router;