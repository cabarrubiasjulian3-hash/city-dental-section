import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getDoctorPatientIds } from "../lib/doctorMatch.js";

const router = Router();
router.use(requireAuth);

// Feed combining three event sources that already exist in the database —
// no new table needed. Each item carries a stable "id" (used by the
// frontend to know what's already been seen), a "type" so the bell can pick
// an icon, and a "link" so clicking it goes straight to the relevant page.
// Admin sees everything, clinic-wide. A doctor only sees messages from
// their own patients (new-patient and new-staff events aren't a doctor's
// concern, and pointing at /admin/... pages they can't open would be a dead
// link for them anyway), linked into their own /doctor/... portal instead.
router.get("/", (req, res) => {
  if (!["admin", "doctor"].includes(req.user.role)) return res.status(403).json({ error: "Admin or doctor only." });

  if (req.user.role === "doctor") {
    const myPatientIds = getDoctorPatientIds(db, req.user.name);
    const messages = myPatientIds.size
      ? db
          .prepare(
            `SELECT m.id, m.body, m.sent_at, u.id AS patient_id, u.name
             FROM messages m
             JOIN users u ON u.id = m.patient_id
             WHERE m.sender = 'patient' AND m.patient_id IN (${[...myPatientIds].map(() => "?").join(",")})
             ORDER BY m.sent_at DESC LIMIT 15`
          )
          .all(...myPatientIds)
      : [];
    return res.json(
      messages.map((m) => ({
        id: `message-${m.id}`,
        type: "message",
        title: `New message from ${m.name}`,
        detail: m.body,
        at: m.sent_at,
        link: `/doctor/messages?patient_id=${m.patient_id}`,
      }))
    );
  }

  const patients = db
    .prepare(`SELECT id, name, created_at FROM users WHERE role = 'patient' ORDER BY created_at DESC LIMIT 15`)
    .all()
    .map((p) => ({
      id: `patient-${p.id}`,
      type: "patient",
      title: "New patient registered",
      detail: p.name,
      at: p.created_at,
      link: `/admin/patients?search=${encodeURIComponent(p.name)}`,
    }));

  const messages = db
    .prepare(
      `SELECT m.id, m.body, m.sent_at, u.id AS patient_id, u.name
       FROM messages m
       JOIN users u ON u.id = m.patient_id
       WHERE m.sender = 'patient'
       ORDER BY m.sent_at DESC LIMIT 15`
    )
    .all()
    .map((m) => ({
      id: `message-${m.id}`,
      type: "message",
      title: `New message from ${m.name}`,
      detail: m.body,
      at: m.sent_at,
      link: `/admin/messages?patient_id=${m.patient_id}`,
    }));

  const staff = db
    .prepare(`SELECT id, name, role, created_at FROM staff ORDER BY created_at DESC LIMIT 15`)
    .all()
    .map((s) => ({
      id: `staff-${s.id}`,
      type: "staff",
      title: /dentist/i.test(s.role || "") ? "New dentist added" : "New staff member added",
      detail: `${s.name} — ${s.role}`,
      at: s.created_at,
      link: `/admin/staff`,
    }));

  const combined = [...patients, ...messages, ...staff]
    .filter((n) => n.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 30);

  res.json(combined);
});

export default router;