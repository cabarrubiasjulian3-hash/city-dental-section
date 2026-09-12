import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getDoctorPatientIds, getAssignedDoctorLabel } from "../lib/doctorMatch.js";

const router = Router();
router.use(requireAuth);

// A doctor should only ever be able to see/send messages for their own
// patients (never someone else's) — this is the one shared gate both the
// GET / and POST / routes below check before touching a specific patient_id,
// so a doctor can't read/reply to a conversation just by guessing an id.
function assertDoctorOwnsPatient(req, res, patientId) {
  if (req.user.role !== "doctor") return true;
  const mine = getDoctorPatientIds(db, req.user.name);
  if (!mine.has(patientId)) {
    res.status(403).json({ error: "You can only message your own patients." });
    return false;
  }
  return true;
}

// List every patient with a conversation (or who could start one): admin
// sees everyone; a doctor sees only their own patients (see
// lib/doctorMatch.js). Each row also carries which doctor (by name) is
// assigned to that patient, so admin's message list can show it.
router.get("/threads", (req, res) => {
  if (!["admin", "doctor"].includes(req.user.role)) return res.status(403).json({ error: "Admin or doctor only." });

  const rows = db
    .prepare(
      `SELECT u.id AS patient_id, u.name,
              (SELECT body FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message,
              (SELECT sent_at FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC LIMIT 1) AS last_sent_at
       FROM users u WHERE u.role = 'patient' ORDER BY last_sent_at DESC`
    )
    .all();

  let result = rows;
  if (req.user.role === "doctor") {
    const myPatientIds = getDoctorPatientIds(db, req.user.name);
    result = result.filter((r) => myPatientIds.has(r.patient_id));
  } else {
    // Admin view: label each thread with whichever doctor is on file for
    // that patient's most recent visit, so it's clear at a glance who's
    // handling them.
    const doctorAccounts = db.prepare(`SELECT id, name FROM users WHERE role = 'doctor'`).all();
    result = result.map((r) => ({
      ...r,
      assigned_doctor: getAssignedDoctorLabel(db, r.patient_id, doctorAccounts),
    }));
  }
  res.json(result);
});

// Get conversation: patient sees own; admin/doctor pass ?patient_id=
router.get("/", (req, res) => {
  const isStaff = req.user.role === "admin" || req.user.role === "doctor";
  const patientId = isStaff ? Number(req.query.patient_id) : req.user.id;
  if (isStaff && !patientId) {
    return res.status(400).json({ error: "patient_id query param required." });
  }
  if (!assertDoctorOwnsPatient(req, res, patientId)) return;

  const rows = db.prepare(`SELECT * FROM messages WHERE patient_id = ? ORDER BY sent_at ASC`).all(patientId);
  res.json(rows);
});

// Send a message
router.post("/", (req, res) => {
  const { body, patient_id } = req.body;
  if (!body) return res.status(400).json({ error: "body is required." });

  const isStaff = req.user.role === "admin" || req.user.role === "doctor";
  const targetPatientId = isStaff ? patient_id : req.user.id;
  if (isStaff && !targetPatientId) {
    return res.status(400).json({ error: "patient_id is required." });
  }
  if (!assertDoctorOwnsPatient(req, res, targetPatientId)) return;

  const sender = isStaff ? req.user.role : "patient";
  const info = db
    .prepare(`INSERT INTO messages (patient_id, sender, body) VALUES (?, ?, ?)`)
    .run(targetPatientId, sender, body);
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

export default router;