import db from "../db.js";

// "Recently edited by …" — every patient record, service record, barangay
// schedule entry and weekly rotation remembers WHO last added or changed it
// and WHEN. The Patient Management, Barangay Schedule and Service History
// screens show this so a doctor can tell who touched a record before them.
//
// Runs once at startup: adds the columns if they're missing (existing rows
// just start out blank — "edited by" appears the next time someone changes
// them).

const STAMPED_TABLES = ["users", "dental_records", "barangay_schedule", "recurring_barangay_schedule"];

for (const table of STAMPED_TABLES) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes("last_edited_by")) db.exec(`ALTER TABLE ${table} ADD COLUMN last_edited_by TEXT`);
  if (!cols.includes("last_edited_role")) db.exec(`ALTER TABLE ${table} ADD COLUMN last_edited_role TEXT`);
  if (!cols.includes("last_edited_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN last_edited_at TEXT`);
}
// Which account created a patient record — lets a doctor keep access to a
// patient they just added even before a service record names them.
{
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.includes("created_by_id")) db.exec("ALTER TABLE users ADD COLUMN created_by_id INTEGER");
}

// Marks a row as edited by `user` (the logged-in account: { name, role }) right now.
export function stampEdit(table, id, user) {
  if (!STAMPED_TABLES.includes(table) || id == null || !user) return;
  db.prepare(
    `UPDATE ${table} SET last_edited_by = ?, last_edited_role = ?, last_edited_at = datetime('now') WHERE id = ?`
  ).run(user.name || null, user.role || null, id);
}