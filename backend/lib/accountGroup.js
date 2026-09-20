import db from "../db.js";

// Which section of Admin → User Management an account belongs in. The SERVER
// decides this (the page no longer works it out on its own), and it does so
// right when someone signs up or logs in — see routes/auth.js — as well as
// every time the User Management list is loaded (routes/users.js).
//
//   staff     doctor and admin accounts             -> "Doctors & Staff"
//   patients  patient with at least one service     -> "Patients"
//             record on file
//   incoming  patient with an account but no        -> "No records yet"
//             service record yet
export const ACCOUNT_GROUPS = ["staff", "patients", "incoming"];

// Same rule as accountGroupFor() below, but as a SQL expression so the whole
// user list can be classified in one query. `alias` is the users table alias.
export function accountGroupSql(alias = "u") {
  return `CASE
    WHEN ${alias}.role IN ('doctor', 'admin') THEN 'staff'
    WHEN EXISTS (SELECT 1 FROM dental_records d WHERE d.patient_id = ${alias}.id) THEN 'patients'
    ELSE 'incoming'
  END`;
}

const recordCountFor = db.prepare("SELECT COUNT(*) AS c FROM dental_records WHERE patient_id = ?");

// Classify one account by id/role. Used at sign-up and login, where the
// server needs to know straight away which group the person belongs to
// (e.g. a patient who signs up and gets linked to their existing clinic
// records is "patients" immediately, not "incoming").
export function accountGroupFor(user) {
  if (!user) return "incoming";
  if (user.role === "doctor" || user.role === "admin") return "staff";
  return recordCountFor.get(user.id).c > 0 ? "patients" : "incoming";
}