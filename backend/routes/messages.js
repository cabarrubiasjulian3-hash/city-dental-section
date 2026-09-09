import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Admin: list all patients who have a conversation (or all patients)
router.get("/threads", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });
  const rows = db
    .prepare(
      `SELECT u.id AS patient_id, u.name,
              (SELECT body FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message,
              (SELECT sent_at FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC LIMIT 1) AS last_sent_at
       FROM users u WHERE u.role = 'patient' ORDER BY last_sent_at DESC`
    )
    .all();
  res.json(rows);
});

// Get conversation: patient sees own; admin passes ?patient_id=
router.get("/", (req, res) => {
  const patientId = req.user.role === "admin" ? Number(req.query.patient_id) : req.user.id;
  if (req.user.role === "admin" && !patientId) {
    return res.status(400).json({ error: "patient_id query param required for admin." });
  }
  const rows = db.prepare(`SELECT * FROM messages WHERE patient_id = ? ORDER BY sent_at ASC`).all(patientId);
  res.json(rows);
});

// Send a message
router.post("/", (req, res) => {
  const { body, patient_id } = req.body;
  if (!body) return res.status(400).json({ error: "body is required." });

  const targetPatientId = req.user.role === "admin" ? patient_id : req.user.id;
  if (req.user.role === "admin" && !targetPatientId) {
    return res.status(400).json({ error: "patient_id is required when sending as admin." });
  }
  const sender = req.user.role === "admin" ? "admin" : "patient";
  const info = db
    .prepare(`INSERT INTO messages (patient_id, sender, body) VALUES (?, ?, ?)`)
    .run(targetPatientId, sender, body);
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

export default router;
