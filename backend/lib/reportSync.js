import db from "../db.js";
import { calcAge } from "./age.js";
import { CATEGORY_FIELDS } from "../routes/monthlyReports.js";

// Every service record logged against a patient in Patient Management is
// automatically tallied into the Monthly Report (both the "By Dentist" and
// "By Barangay" scopes), using the patient's age/sex/pregnancy/senior status
// to pick the same category column the paper e-FHSIS form uses. This is the
// live link between Patient Management and the Monthly Report.
//
// Only the age/sex/pregnant/senior columns are derivable this way. "Orally
// Fit children" and "Clients with DMFT" require a dentist's clinical
// judgment call the app has no way to infer, so records never auto-count
// into those two columns — they stay purely manual on the Monthly Report
// page, same as before.

const FIELD_SET = new Set(CATEGORY_FIELDS);
const ACTIVITY_TYPE = "consultation_extraction"; // what a logged patient visit counts as on the paper form

function calcAgeMonths(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date();
  let months = (today.getFullYear() - b.getFullYear()) * 12 + (today.getMonth() - b.getMonth());
  if (today.getDate() < b.getDate()) months--;
  return Math.max(0, months);
}

// Decide which single CATEGORY_FIELDS column (e.g. "adults_f") a patient's
// visit should be tallied under. Returns null if there isn't enough
// information (missing sex, and not pregnant) to place them anywhere.
export function fieldForPatient(patient) {
  if (!patient) return null;
  const sex = patient.sex === "Female" ? "f" : patient.sex === "Male" ? "m" : null;

  if (patient.is_pregnant) return "pregnant_f"; // paper form's Pregnant Woman column is female-only

  if (!sex) return null; // can't pick an M/F column without a sex on file

  if (patient.is_senior_citizen) return `senior_${sex}`;

  const months = calcAgeMonths(patient.birthdate);
  if (months == null) return null; // no birthdate on file — can't place by age

  if (months < 12) return `infants_${sex}`;
  if (months < 60) return `children_1_4_${sex}`;

  const years = calcAge(patient.birthdate);
  if (years < 10) return `children_5_9_${sex}`;
  if (years < 15) return `adol_10_14_${sex}`;
  if (years < 20) return `adol_15_19_${sex}`;
  if (years < 60) return `adults_${sex}`;
  return `senior_${sex}`;
}

function ensureRow(month, scope, scopeName) {
  db.prepare(
    `INSERT OR IGNORE INTO monthly_report_rows (report_month, scope, scope_name, activity_type) VALUES (?, ?, ?, ?)`
  ).run(month, scope, scopeName, ACTIVITY_TYPE);
}

function bumpField(month, scope, scopeName, field, delta) {
  if (!FIELD_SET.has(field)) return; // guard against an unexpected field name
  ensureRow(month, scope, scopeName);
  db.prepare(
    `UPDATE monthly_report_rows SET ${field} = MAX(0, ${field} + ?)
     WHERE report_month = ? AND scope = ? AND scope_name = ? AND activity_type = ?`
  ).run(delta, month, scope, scopeName, ACTIVITY_TYPE);
}

// Tallies +1 into the Monthly Report for this visit and returns the snapshot
// to store on the dental_records row, so it can be reversed exactly later.
export function applyServiceRecord({ patient, recordDate, dentist }) {
  const field = fieldForPatient(patient);
  if (!field || !recordDate) {
    return { report_month: null, report_field: null, report_barangay: null, report_dentist: null };
  }
  const month = recordDate.slice(0, 7);
  const barangay = patient.barangay && patient.barangay.trim() ? patient.barangay.trim() : null;
  const dentistName = dentist && dentist.trim() ? dentist.trim() : null;

  if (barangay) bumpField(month, "barangay", barangay, field, 1);
  if (dentistName) bumpField(month, "dentist", dentistName, field, 1);

  return { report_month: month, report_field: field, report_barangay: barangay, report_dentist: dentistName };
}

// Reverses whatever a prior applyServiceRecord() call counted, using the
// snapshot stored on the dental_records row (report_month/report_field/
// report_barangay/report_dentist).
export function revertServiceRecord(snapshot) {
  if (!snapshot || !snapshot.report_field || !snapshot.report_month) return;
  const { report_month, report_field, report_barangay, report_dentist } = snapshot;
  if (report_barangay) bumpField(report_month, "barangay", report_barangay, report_field, -1);
  if (report_dentist) bumpField(report_month, "dentist", report_dentist, report_field, -1);
}
