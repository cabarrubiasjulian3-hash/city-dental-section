import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Admin-only feed combining three event sources that already exist in the
// database — no new table needed. Each item carries a stable "id" (used by
// the frontend to know what the admin has already seen), a "type" so the
// bell can pick an icon, and a "link" so clicking it goes straight to the
// relevant page.
router.get("/", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });

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