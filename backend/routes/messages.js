import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getDoctorPatientIds, getAssignedDoctorLabel } from "../lib/doctorMatch.js";

// Migration: remember WHICH doctor (by name) sent each reply, so the patient
// and the other doctors can see who last talked to the patient. Runs once at
// startup and only adds the column if it's missing — existing messages are
// kept as-is (old replies just have no name).
const messageColumns = db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name);
if (!messageColumns.includes("sender_name")) {
  db.exec("ALTER TABLE messages ADD COLUMN sender_name TEXT");
}

// The automated assistant's replies live in their own table (the messages
// table only allows patient/admin/doctor as a sender). They're saved by the
// patient's chat right after the bot answers, so the doctors can see the bot's
// replies in the same conversation. reply_to = the patient message it answered.
db.exec(`
  CREATE TABLE IF NOT EXISTS bot_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reply_to INTEGER,
    body TEXT NOT NULL,
    meta TEXT,
    sent_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bot_replies_patient ON bot_replies(patient_id);
`);

// A bot reply as it goes out to the browsers: same shape as a message, with
// sender "bot" and a string id so it can never clash with a message id.
function botRow(r) {
  let meta = {};
  try {
    meta = r.meta ? JSON.parse(r.meta) : {};
  } catch {
    meta = {};
  }
  return { id: `bot-${r.id}`, patient_id: r.patient_id, sender: "bot", sender_name: null, body: r.body, sent_at: r.sent_at, reply_to: r.reply_to, link: meta.link || null, prefill: meta.prefill || null };
}

const router = Router();
router.use(requireAuth);

const MAX_BODY_LENGTH = 2000;

// Which patients may a doctor open / reply to?
//  1. Their own patients (matched by dentist name on dental records — see
//     lib/doctorMatch.js), same as before; and
//  2. Any patient who has written in through the chatbot (has at least one
//     message of their own). This is the shared chat inbox: every doctor can
//     see and answer these, so two doctors can take turns replying.
function doctorCanAccessPatient(doctorName, patientId) {
  if (getDoctorPatientIds(db, doctorName).has(patientId)) return true;
  const wroteIn = db
    .prepare(`SELECT 1 FROM messages WHERE patient_id = ? AND sender = 'patient' LIMIT 1`)
    .get(patientId);
  return Boolean(wroteIn);
}

// The one shared gate the GET / and POST / routes below check before touching
// a specific patient_id, so a doctor can't read/reply to an unrelated
// patient's conversation just by guessing an id.
function assertDoctorCanAccessPatient(req, res, patientId) {
  if (req.user.role !== "doctor") return true;
  if (doctorCanAccessPatient(req.user.name, patientId)) return true;
  res.status(403).json({ error: "You can only message your own patients or patients who wrote in through the chat." });
  return false;
}

// List every patient with a conversation (or who could start one).
//  - Admin sees everyone.
//  - A doctor sees their own patients PLUS everyone who has messaged in
//    through the chatbot.
// Each row also says who sent the last message (last_sender), and which
// doctor replied last (last_reply_by / last_reply_role) so the doctors can tell
// at a glance who spoke to the patient last and who still needs an answer.
router.get("/threads", (req, res) => {
  if (!["admin", "doctor"].includes(req.user.role)) return res.status(403).json({ error: "Admin or doctor only." });

  const rows = db
    .prepare(
      `SELECT u.id AS patient_id, u.name,
              (SELECT body FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1) AS last_message,
              (SELECT sent_at FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1) AS last_sent_at,
              (SELECT sender FROM messages m WHERE m.patient_id = u.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1) AS last_sender,
              (SELECT sender_name FROM messages m WHERE m.patient_id = u.id AND m.sender IN ('admin','doctor') ORDER BY m.sent_at DESC, m.id DESC LIMIT 1) AS last_reply_by,
              (SELECT sender FROM messages m WHERE m.patient_id = u.id AND m.sender IN ('admin','doctor') ORDER BY m.sent_at DESC, m.id DESC LIMIT 1) AS last_reply_role,
              (SELECT COUNT(*) FROM messages m WHERE m.patient_id = u.id AND m.sender = 'patient') AS patient_message_count
       FROM users u WHERE u.role = 'patient' ORDER BY last_sent_at DESC, u.name ASC`
    )
    .all();

  let result = rows;
  if (req.user.role === "doctor") {
    const myPatientIds = getDoctorPatientIds(db, req.user.name);
    result = result.filter((r) => myPatientIds.has(r.patient_id) || r.patient_message_count > 0);
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
// Each row has sender ('patient' | 'doctor' | 'admin') and, for staff
// replies, sender_name (the name of the account that sent it).
router.get("/", (req, res) => {
  const isStaff = req.user.role === "admin" || req.user.role === "doctor";
  const patientId = isStaff ? Number(req.query.patient_id) : req.user.id;
  if (isStaff && !patientId) {
    return res.status(400).json({ error: "patient_id query param required." });
  }
  if (!assertDoctorCanAccessPatient(req, res, patientId)) return;

  const rows = db.prepare(`SELECT * FROM messages WHERE patient_id = ? ORDER BY sent_at ASC, id ASC`).all(patientId);
  const bots = db.prepare(`SELECT * FROM bot_replies WHERE patient_id = ? ORDER BY id ASC`).all(patientId);

  // Put each bot reply right under the patient message it answered, so the
  // conversation reads: patient → automated reply → doctor.
  const botsByMessage = new Map();
  const orphans = [];
  const messageIds = new Set(rows.map((m) => m.id));
  for (const b of bots) {
    if (b.reply_to != null && messageIds.has(b.reply_to)) {
      if (!botsByMessage.has(b.reply_to)) botsByMessage.set(b.reply_to, []);
      botsByMessage.get(b.reply_to).push(botRow(b));
    } else {
      orphans.push(botRow(b));
    }
  }
  const merged = [];
  for (const m of rows) {
    merged.push(m);
    for (const b of botsByMessage.get(m.id) || []) merged.push(b);
  }
  merged.push(...orphans);
  res.json(merged);
});

// The patient's chat saves the automated reply it just showed, so doctors see
// it too. Patients only; it can only answer one of the patient's OWN messages,
// and only once per message.
router.post("/bot-reply", (req, res) => {
  if (req.user.role !== "patient") return res.status(403).json({ error: "Patients only." });
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "body is required." });
  if (body.length > MAX_BODY_LENGTH * 2) return res.status(400).json({ error: "Reply is too long." });

  const replyTo = Number(req.body?.reply_to);
  const original = db
    .prepare(`SELECT id FROM messages WHERE id = ? AND patient_id = ? AND sender = 'patient'`)
    .get(replyTo, req.user.id);
  if (!original) return res.status(404).json({ error: "Message not found." });

  const existing = db.prepare(`SELECT * FROM bot_replies WHERE reply_to = ? AND patient_id = ?`).get(replyTo, req.user.id);
  if (existing) return res.json(botRow(existing));

  const link = req.body?.link && typeof req.body.link === "object"
    ? { to: String(req.body.link.to || "").slice(0, 200), label: String(req.body.link.label || "").slice(0, 100) }
    : null;
  const prefill = req.body?.prefill ? String(req.body.prefill).slice(0, MAX_BODY_LENGTH) : null;
  const meta = JSON.stringify({ link: link && link.to ? link : null, prefill });

  const info = db
    .prepare(`INSERT INTO bot_replies (patient_id, reply_to, body, meta) VALUES (?, ?, ?, ?)`)
    .run(req.user.id, replyTo, body, meta);
  res.status(201).json(botRow(db.prepare(`SELECT * FROM bot_replies WHERE id = ?`).get(info.lastInsertRowid)));
});

// Send a message. A patient's message goes into their own thread (where every
// doctor can see it); a doctor/admin reply is stamped with their own name.
router.post("/", (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "body is required." });
  if (body.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message is too long (max ${MAX_BODY_LENGTH} characters).` });
  }

  const isStaff = req.user.role === "admin" || req.user.role === "doctor";
  const targetPatientId = isStaff ? Number(req.body?.patient_id) : req.user.id;
  if (isStaff && !targetPatientId) {
    return res.status(400).json({ error: "patient_id is required." });
  }
  if (isStaff && !db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'patient'`).get(targetPatientId)) {
    return res.status(404).json({ error: "Patient not found." });
  }
  if (!assertDoctorCanAccessPatient(req, res, targetPatientId)) return;

  const sender = isStaff ? req.user.role : "patient";
  const senderName = isStaff ? req.user.name : null;
  const info = db
    .prepare(`INSERT INTO messages (patient_id, sender, sender_name, body) VALUES (?, ?, ?, ?)`)
    .run(targetPatientId, sender, senderName, body);
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(row);
});

export default router;