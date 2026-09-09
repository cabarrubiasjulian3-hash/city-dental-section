// One-off utility: deletes ALL patient records from the database.
// Run from the backend folder:   node delete-patients.js
//
// Thanks to "ON DELETE CASCADE" on the related tables, deleting a row from
// `users` (role='patient') automatically deletes that patient's:
//   - dental_records, vitals, messages, tooth_conditions, password_resets
// Staff, Barangay Schedule, and Monthly Report data are NOT touched.
import db from "./db.js";

db.pragma("foreign_keys = ON");

const before = db.prepare("SELECT COUNT(*) c FROM users WHERE role='patient'").get().c;
const result = db.prepare("DELETE FROM users WHERE role = 'patient'").run();

console.log(`Found ${before} patient(s). Deleted ${result.changes} row(s) (plus their related records).`);