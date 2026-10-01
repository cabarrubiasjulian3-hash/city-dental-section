import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureActivityLogTable } from "../middleware/auditLog.js";
import { todayInManila, nowMinutesInManila, parseEndMinutes } from "../lib/scheduleStatus.js";

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
//  - PATIENT: replies from the clinic, changes a doctor/admin made to their own
//    information, new dental records, and ongoing / upcoming barangay dental
//    missions — see the PATIENT bell section further down.
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

// ---------------------------------------------------------------------------
// PATIENT bell. A patient only ever sees what concerns THEM — every query in
// this section is filtered by the logged-in patient's own id.
//  - message:           a doctor/admin replied in the chat and the patient
//                       hasn't written back yet.
//  - info_update:       a doctor/admin changed the patient's personal
//                       information, vital signs or oral health chart.
//  - record_update:     a doctor/admin edited one of the patient's dental records.
//  - dental_record:     a NEW dental record was added (e.g. a tooth extraction).
//  - schedule_ongoing:  a barangay dental mission is happening TODAY.
//  - schedule_upcoming: a barangay dental mission is coming up within a week.
// Changes older than PATIENT_RECENT_DAYS are left out so the bell of a
// long-time patient doesn't fill up with old news.
// ---------------------------------------------------------------------------
const PATIENT_RECENT_DAYS = 30;
const UPCOMING_WINDOW_DAYS = 7;
const MAX_SCHEDULE_ITEMS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// What a doctor/admin's logged action reads like to the PATIENT.
const PATIENT_INFO_ACTIONS = ["updated_patient", "logged_vitals", "updated_oral_chart", "updated_service_record"];

// The patient-info fields a PATCH /patients/:id can change, grouped under the
// plain-language label the patient will read ("Address, Cellphone number").
const FIELD_LABEL_GROUPS = {
  Name: ["name", "surname", "first_name", "middle_name"],
  Email: ["email"],
  Birthdate: ["birthdate"],
  Sex: ["sex"],
  Barangay: ["barangay"],
  Address: ["address"],
  Occupation: ["occupation"],
  "Place of birth": ["place_of_birth"],
  "Parent/guardian": ["parent_guardian"],
  "Cellphone number": ["cellphone_no"],
  "Pregnant status": ["is_pregnant"],
  "Senior citizen status": ["is_senior_citizen"],
  "PWD status": ["is_pwd"],
  Membership: ["is_nhts_pr", "is_4ps", "is_indigenous_people", "philhealth_no", "sss_no", "gsis_no"],
  "Medical history": [
    "allergies", "has_hypertension_cva", "has_diabetes_mellitus", "has_blood_disorders",
    "has_cardio_heart_disease", "has_thyroid_disorders", "hepatitis", "malignancy",
  ],
  "Hospitalization history": ["hosp_medical", "hosp_surgical", "hosp_blood_transfusion", "has_tattoo", "hosp_others"],
  "Dietary/social history": ["diet_sugar_beverages", "diet_alcohol", "diet_tobacco", "diet_betel_nut"],
  Conforme: ["conforme_name"],
};
const PATIENT_FIELD_LABELS = Object.fromEntries(
  Object.entries(FIELD_LABEL_GROUPS).flatMap(([label, fields]) => fields.map((f) => [f, label]))
);

// "address, cellphone_no" (what the audit log stored) -> "Address, Cellphone number"
function describeChangedFields(details) {
  const labels = [];
  for (const d of details) {
    for (const field of String(d || "").split(",")) {
      const label = PATIENT_FIELD_LABELS[field.trim()];
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  if (!labels.length) return "Your personal information";
  const shown = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `${shown} +${labels.length - 3} more` : shown;
}

// Who did it, as the patient reads it. Doctors by name; admin accounts are
// shown as "Clinic admin" (the patient doesn't need the admin's own name).
function clinicStaffLabel(role, name) {
  return role === "doctor" ? doctorLabel(name) : "Clinic admin";
}

// Same idea as groupDoctorActivity: one doctor editing a record field by field
// logs many rows — fold rows for the same person + kind of change made within
// 30 minutes of each other into ONE item, remembering every field touched.
function groupPatientActivity(rows) {
  const WINDOW_MS = 30 * 60 * 1000;
  const groups = [];
  for (const r of rows) {
    const t = new Date(toIso(r.created_at)).getTime();
    const g = groups.find(
      (x) => x.actor_id === r.actor_id && x.actor_role === r.actor_role && x.action === r.action && x.oldest - t <= WINDOW_MS
    );
    if (g) {
      g.count += 1;
      g.oldest = t;
      g.details.push(r.detail);
    } else {
      groups.push({ ...r, count: 1, oldest: t, details: [r.detail] });
    }
  }
  return groups;
}

// The latest of several ISO timestamps (ignoring blanks), or null.
function latestIso(...values) {
  const times = values.filter(Boolean).map((v) => new Date(v).getTime()).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

// Replies from the clinic the patient hasn't answered yet (same rule as the
// doctor's bell, mirrored): staff messages sent after the patient's own last
// message. The patient writing back makes the item go away.
function patientMessageItems(userId) {
  const lastOwn = db
    .prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE patient_id = ? AND sender = 'patient'`)
    .get(userId).id;
  const replies = db
    .prepare(
      `SELECT id, sender, sender_name, body, sent_at FROM messages
       WHERE patient_id = ? AND sender IN ('admin','doctor') AND id > ?
         AND sent_at >= datetime('now', ?)
       ORDER BY id DESC LIMIT 50`
    )
    .all(userId, lastOwn, `-${PATIENT_RECENT_DAYS} days`);
  if (!replies.length) return [];
  const latest = replies[0];
  const who = clinicStaffLabel(latest.sender, latest.sender_name);
  return [
    {
      id: `message-${latest.id}`,
      type: "message",
      title: replies.length > 1 ? `${replies.length} new messages from ${who}` : `New message from ${who}`,
      detail: String(latest.body || "").slice(0, 140),
      at: toIso(latest.sent_at),
      link: "/patient/messages",
    },
  ];
}

// Newly added dental records (a tooth extraction, a cleaning, ...). Clicking
// one opens that record on the Dental Record page (it reads openRecordId).
function patientRecordItems(userId) {
  return db
    .prepare(
      `SELECT id, procedure, record_date, created_at FROM dental_records
       WHERE patient_id = ? AND created_at >= datetime('now', ?)
       ORDER BY created_at DESC, id DESC LIMIT 5`
    )
    .all(userId, `-${PATIENT_RECENT_DAYS} days`)
    .map((r) => ({
      id: `record-${r.id}`,
      type: "dental_record",
      title: /extract|bunot|hilas/i.test(r.procedure || "") ? "Your tooth extraction was recorded" : "New dental record added",
      detail: [r.procedure, r.record_date].filter(Boolean).join(" · "),
      at: toIso(r.created_at),
      link: "/patient/dental-record",
      state: { openRecordId: r.id },
    }));
}

// What a doctor OR admin changed about this patient (from the activity log —
// see middleware/auditLog.js, which now logs admin changes too).
function patientChangeItems(userId) {
  const placeholders = PATIENT_INFO_ACTIONS.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT l.* FROM activity_log l
       JOIN users u ON u.id = l.patient_id
       WHERE l.patient_id = ?
         AND l.actor_role IN ('doctor', 'admin')
         AND l.action IN (${placeholders})
         AND l.created_at >= datetime('now', ?)
         -- The follow-up edits made while a front-desk person is still creating
         -- the record aren't news to the patient.
         AND (l.action <> 'updated_patient' OR l.created_at > datetime(u.created_at, '+10 minutes'))
       ORDER BY l.created_at DESC, l.id DESC LIMIT 100`
    )
    .all(userId, ...PATIENT_INFO_ACTIONS, `-${PATIENT_RECENT_DAYS} days`);

  return groupPatientActivity(rows).slice(0, 10).map((g) => {
    const who = clinicStaffLabel(g.actor_role, g.actor_name);
    const base = { id: `activity-${g.id}`, at: toIso(g.created_at) };
    switch (g.action) {
      case "logged_vitals":
        return { ...base, type: "info_update", title: `${who} recorded your vital signs`, detail: "See the Vitals card on your dashboard.", link: "/patient" };
      case "updated_oral_chart":
        return { ...base, type: "info_update", title: `${who} updated your oral health chart`, detail: "Open a record on your Dental Record page to see it.", link: "/patient/dental-record" };
      case "updated_service_record":
        return {
          ...base,
          type: "record_update",
          title: `${who} updated a dental record`,
          detail: String(g.detail || "").split(" · ")[0] || "See your Dental Record page.",
          link: "/patient/dental-record",
        };
      default: // updated_patient
        return {
          ...base,
          type: "info_update",
          title: `${who} updated your information`,
          detail: describeChangedFields(g.details),
          link: "/patient/profile",
        };
    }
  });
}

// Same status the patient sees on the Barangay Schedule page (see
// frontend/src/lib/scheduleStatus.js effectiveStatus): a visit today is
// "Ongoing" until the end of its time range; a future one is "Upcoming".
function scheduleStatusNow(s, today, nowMin) {
  const date = String(s.visit_date).slice(0, 10);
  if (s.status === "Not Completed") return "Not Completed";
  if (date === today) {
    const endMin = parseEndMinutes(s.time_range);
    return endMin !== null && nowMin >= endMin ? "Completed" : "Ongoing";
  }
  if (date < today) return "Completed";
  return s.status || "Upcoming";
}

// Missions happening today (every barangay) and the next one coming up for
// each barangay within the next week. The patient's own barangay goes first
// and is worded as "in your barangay"; other barangays are still listed,
// because the Barangay Schedule page shows every barangay too.
function patientScheduleItems(patientBarangay) {
  const today = todayInManila();
  const nowMin = nowMinutesInManila();
  const mine = String(patientBarangay || "").trim().toLowerCase();

  const rows = db
    .prepare(`SELECT * FROM barangay_schedule WHERE substr(visit_date, 1, 10) >= ? ORDER BY visit_date ASC, id ASC`)
    .all(today);

  const nearestUpcoming = new Set(); // one upcoming item per barangay
  const candidates = [];
  for (const s of rows) {
    const status = scheduleStatusNow(s, today, nowMin);
    if (status !== "Ongoing" && status !== "Upcoming") continue;

    const date = String(s.visit_date).slice(0, 10);
    const startOfDay = new Date(`${date}T00:00:00+08:00`).getTime(); // Manila midnight
    const isMine = !!mine && String(s.barangay_name || "").trim().toLowerCase() === mine;
    const posted = toIso(s.created_at);
    const place = isMine ? "your barangay" : `Brgy. ${s.barangay_name}`;

    if (status === "Ongoing") {
      candidates.push({
        isMine,
        sortDate: date,
        item: {
          id: `schedule-ongoing-${s.id}`,
          type: "schedule_ongoing",
          title: `Dental mission is happening today in ${place}`,
          detail: [s.time_range, s.services, s.location].filter(Boolean).join(" · ") || "Happening now",
          at: latestIso(posted, new Date(startOfDay).toISOString()),
          link: "/patient/barangay-schedule",
        },
      });
      continue;
    }

    const daysAway = Math.round((startOfDay - new Date(`${today}T00:00:00+08:00`).getTime()) / DAY_MS);
    if (daysAway > UPCOMING_WINDOW_DAYS) continue;
    const key = String(s.barangay_name || "").trim().toLowerCase();
    if (nearestUpcoming.has(key)) continue;
    nearestUpcoming.add(key);

    const dateLabel = new Date(startOfDay).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
    // New as soon as it's posted, and again the day before as a reminder.
    const dayBefore = startOfDay - DAY_MS;
    candidates.push({
      isMine,
      sortDate: date,
      item: {
        id: `schedule-upcoming-${s.id}`,
        type: "schedule_upcoming",
        title: `Dental mission in ${place} ${daysAway === 1 ? "tomorrow" : `on ${dateLabel}`}`,
        detail: [daysAway === 1 ? dateLabel : null, s.time_range, s.services, s.location].filter(Boolean).join(" · ") || dateLabel,
        at: latestIso(posted, dayBefore <= Date.now() ? new Date(dayBefore).toISOString() : null),
        link: "/patient/barangay-schedule",
      },
    });
  }

  return candidates
    .sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.sortDate.localeCompare(b.sortDate))
    .slice(0, MAX_SCHEDULE_ITEMS)
    .map((c) => c.item);
}

function patientNotifications(userId) {
  const me = db.prepare(`SELECT barangay FROM users WHERE id = ?`).get(userId);
  return [
    ...patientMessageItems(userId),
    ...patientRecordItems(userId),
    ...patientChangeItems(userId),
    ...patientScheduleItems(me?.barangay),
  ]
    .filter((n) => n.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 30);
}

router.get("/", (req, res) => {
  // Patients get their own feed (see the PATIENT bell section above).
  if (req.user.role === "patient") return res.json(patientNotifications(req.user.id));
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