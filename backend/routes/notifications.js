import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureActivityLogTable } from "../middleware/auditLog.js";

// The admin feed reads what doctors changed (see middleware/auditLog.js).
ensureActivityLogTable();

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
//    the same message. Links into /doctor/messages. Also lists WHICH DOCTOR
//    changed patient records / the barangay schedule ("Dr. Ana Lopez updated
//    a patient record"); your own changes show as "You …" and don't count
//    toward the unread badge (mine: true).
//  - ADMIN: new patients, new staff, and what DOCTORS changed on patient
//    records ("Dr. Ana Lopez updated a patient record"). Messages aren't an
//    admin thing anymore (the Messages page lives in the Doctor Portal).
// What a doctor's logged action reads like in the bell.
const DOCTOR_ACTION_TEXT = {
  created_patient: "added a new patient record",
  updated_patient: "updated a patient record",
  archived_patient: "archived a patient record",
  added_service_record: "added a service record",
  updated_service_record: "updated a service record",
  archived_service_record: "archived a service record",
  logged_vitals: "logged vital signs",
  updated_oral_chart: "updated an oral health chart",
  imported_patients: "imported patient records",
  created_schedule: "added a barangay schedule entry",
  updated_schedule: "updated a barangay schedule entry",
  archived_schedule: "archived a barangay schedule entry",
  created_rotation: "set up a weekly rotation",
  updated_rotation: "updated a weekly rotation",
  paused_rotation: "paused a weekly rotation",
  resumed_rotation: "resumed a weekly rotation",
  archived_rotation: "archived a weekly rotation",
};

const SCHEDULE_ACTIONS = new Set([
  "created_schedule", "updated_schedule", "archived_schedule",
  "created_rotation", "updated_rotation", "paused_rotation", "resumed_rotation", "archived_rotation",
]);

// The "what did the doctors change" items, shared by the admin and doctor
// bells. `portal` is "admin" or "doctor" (for the links); `viewerId` marks the
// viewing doctor's own changes ("You …").
function doctorChangeItems(portal, viewerId) {
  return groupDoctorActivity(
    db.prepare(`SELECT * FROM activity_log WHERE actor_role = 'doctor' ORDER BY created_at DESC, id DESC LIMIT 200`).all()
  )
    .slice(0, 15)
    .map((g) => {
      const mine = viewerId != null && g.actor_id === viewerId;
      const isSchedule = SCHEDULE_ACTIONS.has(g.action);
      const what = DOCTOR_ACTION_TEXT[g.action] || "changed a record";
      const subject = isSchedule ? g.detail || "" : g.patient_name || "a patient";
      const extra = isSchedule ? "" : g.count > 1 ? ` — ${g.count} changes` : g.detail ? ` — ${g.detail}` : "";
      return {
        id: `activity-${g.id}`,
        type: "record_change",
        title: `${mine ? "You" : doctorLabel(g.actor_name)} ${what}`,
        detail: subject + extra,
        at: toIso(g.created_at),
        mine,
        link: isSchedule
          ? `/${portal}/barangay-schedule`
          : g.patient_name
          ? `/${portal}/patients?search=${encodeURIComponent(g.patient_name)}`
          : `/${portal}/patients`,
      };
    });
}

function doctorLabel(name) {
  const clean = String(name || "").trim().replace(/^(dr\.?|doctor)\s+/i, "");
  return clean ? `Dr. ${clean}` : "A doctor";
}

// A doctor editing one record field-by-field logs many rows. Fold rows for the
// same doctor + patient + kind of change made within 30 minutes of each other
// into ONE bell item ("… — 5 changes"). Rows arrive newest first.
function groupDoctorActivity(rows) {
  const WINDOW_MS = 30 * 60 * 1000;
  const groups = [];
  for (const r of rows) {
    const t = new Date(toIso(r.created_at)).getTime();
    const g = groups.find(
      (x) => x.actor_id === r.actor_id && x.patient_id === r.patient_id && x.action === r.action && x.oldest - t <= WINDOW_MS
    );
    if (g) {
      g.count += 1;
      g.oldest = t;
    } else {
      groups.push({ ...r, count: 1, oldest: t });
    }
  }
  return groups;
}

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
    const messageItems = waiting.map((w) => {
      const last = lastMessage.get(w.last_id);
      return {
        id: `message-${w.last_id}`,
        type: "message",
        title: w.unanswered > 1 ? `${w.unanswered} new messages from ${w.name}` : `New message from ${w.name}`,
        detail: last.body,
        at: toIso(last.sent_at),
        link: `/doctor/messages?patient_id=${w.patient_id}`,
      };
    });
    return res.json(
      [...messageItems, ...doctorChangeItems("doctor", req.user.id)]
        .filter((n) => n.at)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, 30)
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

  const doctorChanges = doctorChangeItems("admin", null);

  const combined = [...patients, ...staff, ...doctorChanges]
    .filter((n) => n.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 30);

  res.json(combined);
});

export default router;