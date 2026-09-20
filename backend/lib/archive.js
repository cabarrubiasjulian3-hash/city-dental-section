import db from "../db.js";
import { applyServiceRecord, revertServiceRecord } from "./reportSync.js";

// "Delete" / "Remove" in the portals = move to Archive. Each archive*()
// function below takes a snapshot of the item (as JSON) into the `archive`
// table and then removes it from its live table, so every existing screen,
// count and report simply stops seeing it. restoreEntry() puts the snapshot
// back exactly as it was. Nothing is ever destroyed by the delete buttons.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

const columnCache = {};
function columnsOf(table) {
  if (!columnCache[table]) {
    columnCache[table] = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  }
  return columnCache[table];
}

// Inserts a snapshot row back into its table, keeping its original id (ids
// are AUTOINCREMENT so they're never reused) unless something else somehow
// took it. Only columns that still exist in the table are written.
function insertRow(table, row) {
  const data = { ...row };
  if (data.id != null && db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(data.id)) delete data.id;
  const cols = columnsOf(table).filter((c) => Object.prototype.hasOwnProperty.call(data, c));
  db.prepare(
    `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
  ).run(...cols.map((c) => data[c]));
}

function addToArchive({ type, entityId, label, detail, data, user }) {
  db.prepare(
    `INSERT INTO archive (entity_type, entity_id, label, detail, data, archived_by, archived_by_name, archived_by_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(type, entityId ?? null, label, detail || null, JSON.stringify(data), user?.id ?? null, user?.name ?? null, user?.role ?? null);
}

// ---------------------------------------------------------------- patients

// A patient goes to the archive together with everything attached to them
// (service records, vitals, messages, tooth chart). Their service records are
// also taken back out of the Report tallies so counts stay accurate, and
// tallied again on restore.
export const archivePatient = db.transaction((id, user) => {
  const patient = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'patient'").get(id);
  if (!patient) return false;

  const records = db.prepare("SELECT * FROM dental_records WHERE patient_id = ?").all(id);
  const data = {
    user: patient,
    vitals: db.prepare("SELECT * FROM vitals WHERE patient_id = ?").all(id),
    dental_records: records,
    messages: db.prepare("SELECT * FROM messages WHERE patient_id = ?").all(id),
    tooth_conditions: db.prepare("SELECT * FROM tooth_conditions WHERE patient_id = ?").all(id),
  };

  for (const r of records) revertServiceRecord(r);
  addToArchive({
    type: "patient",
    entityId: id,
    label: patient.name,
    detail: [patient.barangay, `${records.length} service record${records.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
    data,
    user,
  });
  db.prepare("DELETE FROM users WHERE id = ?").run(id); // children go with it (ON DELETE CASCADE)
  return true;
});

function restorePatient(data) {
  const u = data.user;
  if (db.prepare("SELECT 1 FROM users WHERE id = ?").get(u.id)) {
    throw conflict("Can't restore — that patient's ID is already in use.");
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(u.email)) {
    throw conflict(`Can't restore — another account already uses the email ${u.email}.`);
  }
  insertRow("users", u);
  for (const v of data.vitals || []) insertRow("vitals", v);
  for (const m of data.messages || []) insertRow("messages", m);
  for (const t of data.tooth_conditions || []) insertRow("tooth_conditions", t);
  for (const r of data.dental_records || []) {
    const snapshot = applyServiceRecord({ patient: u, recordDate: r.record_date, dentist: r.dentist });
    insertRow("dental_records", { ...r, ...snapshot });
  }
}

// ---------------------------------------------------------- service records

export const archiveServiceRecord = db.transaction((id, user) => {
  const record = db.prepare("SELECT * FROM dental_records WHERE id = ?").get(id);
  if (!record) return false;
  const patient = db.prepare("SELECT name FROM users WHERE id = ?").get(record.patient_id);

  revertServiceRecord(record);
  addToArchive({
    type: "service_record",
    entityId: id,
    label: `${record.procedure} — ${record.record_date}`,
    detail: [patient?.name, record.dentist].filter(Boolean).join(" · "),
    data: { record },
    user,
  });
  db.prepare("DELETE FROM dental_records WHERE id = ?").run(id);
  return true;
});

function restoreServiceRecord(data) {
  const r = data.record;
  const patient = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'patient'").get(r.patient_id);
  if (!patient) throw conflict("Can't restore this record — its patient is archived or gone. Restore the patient first.");
  const snapshot = applyServiceRecord({ patient, recordDate: r.record_date, dentist: r.dentist });
  insertRow("dental_records", { ...r, ...snapshot });
}

// -------------------------------------------------------- barangay schedule

function archiveScheduleRow(row, user) {
  addToArchive({
    type: "barangay_schedule",
    entityId: row.id,
    label: `${row.barangay_name} — ${row.visit_date}`,
    detail: [row.services, row.dentist, row.status].filter(Boolean).join(" · "),
    data: { row },
    user,
  });
  db.prepare("DELETE FROM barangay_schedule WHERE id = ?").run(row.id);
}

export const archiveScheduleEntry = db.transaction((id, user) => {
  const row = db.prepare("SELECT * FROM barangay_schedule WHERE id = ?").get(id);
  if (!row) return false;
  archiveScheduleRow(row, user);
  return true;
});

function restoreScheduleEntry(data) {
  const row = { ...data.row };
  if (row.recurring_rule_id != null && !db.prepare("SELECT 1 FROM recurring_barangay_schedule WHERE id = ?").get(row.recurring_rule_id)) {
    row.recurring_rule_id = null; // its weekly rotation is archived/gone — restore as a standalone date
  }
  insertRow("barangay_schedule", row);
}

// "barangay|date" keys of archived schedule entries. The weekly-rotation
// generator (routes/barangaySchedule.js) skips these, otherwise a removed
// rotation date would just be re-created on the next page load.
export function archivedScheduleKeys() {
  const keys = [];
  for (const r of db.prepare("SELECT data FROM archive WHERE entity_type = 'barangay_schedule'").all()) {
    try {
      const row = JSON.parse(r.data).row;
      keys.push(`${row.barangay_name}|${row.visit_date}`);
    } catch {
      /* ignore an unreadable snapshot */
    }
  }
  return keys;
}

// ----------------------------------------------------------- weekly rotation

// removeFuture = also archive the rotation's upcoming (not yet completed)
// dates. Dates that stay behind keep existing as normal standalone entries.
export const archiveRotation = db.transaction((id, removeFuture, user) => {
  const rule = db.prepare("SELECT * FROM recurring_barangay_schedule WHERE id = ?").get(id);
  if (!rule) return false;

  if (removeFuture) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = db
      .prepare("SELECT * FROM barangay_schedule WHERE recurring_rule_id = ? AND visit_date >= ? AND status != 'Completed'")
      .all(id, today);
    for (const row of upcoming) archiveScheduleRow(row, user);
  }
  db.prepare("UPDATE barangay_schedule SET recurring_rule_id = NULL WHERE recurring_rule_id = ?").run(id);

  addToArchive({
    type: "rotation",
    entityId: id,
    label: `Every ${DAY_NAMES[rule.day_of_week] ?? "week"} — ${rule.barangay_name}`,
    detail: [rule.dentist, rule.services, rule.time_range].filter(Boolean).join(" · "),
    data: { rule },
    user,
  });
  db.prepare("DELETE FROM recurring_barangay_schedule WHERE id = ?").run(id);
  return true;
});

function restoreRotation(data) {
  insertRow("recurring_barangay_schedule", data.rule);
}

// --------------------------------------------------------------------- staff

export const archiveStaff = db.transaction((id, user) => {
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  if (!row) return false;
  addToArchive({
    type: "staff",
    entityId: id,
    label: row.name,
    detail: [row.role, row.email || row.phone].filter(Boolean).join(" · "),
    data: { row },
    user,
  });
  db.prepare("DELETE FROM staff WHERE id = ?").run(id);
  return true;
});

function restoreStaff(data) {
  insertRow("staff", data.row);
}

// -------------------------------------------------------------- access codes

export const archiveAccessCode = db.transaction((id, user) => {
  const row = db.prepare("SELECT * FROM access_codes WHERE id = ?").get(id);
  if (!row) return false;
  addToArchive({ type: "access_code", entityId: id, label: row.code, detail: `Status: ${row.status}`, data: { row }, user });
  db.prepare("DELETE FROM access_codes WHERE id = ?").run(id);
  return true;
});

function restoreAccessCode(data) {
  const row = { ...data.row };
  if (db.prepare("SELECT 1 FROM access_codes WHERE code = ?").get(row.code)) {
    throw conflict(`Can't restore — the code ${row.code} already exists.`);
  }
  for (const col of ["created_by", "used_by"]) {
    if (row[col] != null && !db.prepare("SELECT 1 FROM users WHERE id = ?").get(row[col])) row[col] = null;
  }
  insertRow("access_codes", row);
}

// ------------------------------------------------------------------- restore

const RESTORERS = {
  patient: restorePatient,
  service_record: restoreServiceRecord,
  barangay_schedule: restoreScheduleEntry,
  rotation: restoreRotation,
  staff: restoreStaff,
  access_code: restoreAccessCode,
};

// Puts an archived item back and removes it from the archive. Runs in one
// transaction, so if anything fails (e.g. the 409 conflicts above) nothing
// is half-restored.
export const restoreEntry = db.transaction((archiveId) => {
  const entry = db.prepare("SELECT * FROM archive WHERE id = ?").get(archiveId);
  if (!entry) return null;
  const restore = RESTORERS[entry.entity_type];
  if (!restore) throw conflict("Unknown archive item type.");
  restore(JSON.parse(entry.data));
  db.prepare("DELETE FROM archive WHERE id = ?").run(archiveId);
  return { type: entry.entity_type, label: entry.label };
});