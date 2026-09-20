import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// SQLite writes timestamps as UTC "YYYY-MM-DD HH:MM:SS" with no time zone
// marker, which a browser reads as LOCAL time — so a message that just
// arrived could look hours old (8 hours off in the Philippines) and never
// count as "new" on the bell. Sending a real ISO string (…Z) fixes that.
function toIso(sqliteTimestamp) {
  if (!sqliteTimestamp) return null;
  const d = new Date(`${String(sqliteTimestamp).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Notification bell feed. Each item carries a stable "id" (React key), a
// "type" so the bell can pick an icon, an "at" time (the bell counts items
// newer than the last time it was opened) and a "link" so clicking it goes
// straight to the relevant page.
//
//  - DOCTOR: patient chat messages that nobody has answered yet — one item
//    per patient (with a count if they sent several), for ALL doctors, since
//    every doctor shares the chat inbox. As soon as ANY doctor replies to that
//    patient, the item disappears for everyone, so two doctors don't answer
//    the same message. Links into /doctor/messages.
//  - ADMIN: new patients and new staff only. Messages aren't an admin thing
//    anymore (the Messages page lives in the Doctor Portal).
router.get("/", (req, res) => {
  if (!["admin", "doctor"].includes(req.user.role)) return res.status(403).json({ error: "Admin or doctor only." });

  if (req.user.role === "doctor") {
    // A patient message is "unanswered" if no admin/doctor reply came after it.
    const waiting = db
      .prepare(
        `SELECT m.patient_id, u.name, COUNT(*) AS unanswered, MAX(m.id) AS last_id
         FROM messages m
         JOIN users u ON u.id = m.patient_id
         WHERE m.sender = 'patient'
           AND m.id > COALESCE(
             (SELECT MAX(r.id) FROM messages r WHERE r.patient_id = m.patient_id AND r.sender IN ('admin','doctor')), 0)
         GROUP BY m.patient_id
         ORDER BY last_id DESC
         LIMIT 15`
      )
      .all();

    const lastMessage = db.prepare(`SELECT body, sent_at FROM messages WHERE id = ?`);
    return res.json(
      waiting.map((w) => {
        const last = lastMessage.get(w.last_id);
        return {
          id: `message-${w.last_id}`,
          type: "message",
          title: w.unanswered > 1 ? `${w.unanswered} new messages from ${w.name}` : `New message from ${w.name}`,
          detail: last.body,
          at: toIso(last.sent_at),
          link: `/doctor/messages?patient_id=${w.patient_id}`,
        };
      })
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
      at: toIso(p.created_at),
      link: `/admin/patients?search=${encodeURIComponent(p.name)}`,
    }));

  const staff = db
    .prepare(`SELECT id, name, role, created_at FROM staff ORDER BY created_at DESC LIMIT 15`)
    .all()
    .map((s) => ({
      id: `staff-${s.id}`,
      type: "staff",
      title: /dentist/i.test(s.role || "") ? "New dentist added" : "New staff member added",
      detail: `${s.name} — ${s.role}`,
      at: toIso(s.created_at),
      link: `/admin/staff`,
    }));

  const combined = [...patients, ...staff]
    .filter((n) => n.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 30);

  res.json(combined);
});

export default router;