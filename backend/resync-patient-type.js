// One-time fix: re-tallies service records whose Monthly Report count doesn't
// match their saved Patient Type (e.g. records saved before Patient Type was
// connected to Reports). Safe to run more than once — records that already
// match are left alone.
//
//   cd backend && node resync-patient-type.js
import db from "./db.js";
import { fieldForPatient, applyServiceRecord, revertServiceRecord } from "./lib/reportSync.js";

const records = db.prepare("SELECT * FROM dental_records").all();
const getPatient = db.prepare("SELECT * FROM users WHERE id = ?");
const save = db.prepare(
  `UPDATE dental_records SET report_month = ?, report_field = ?, report_barangay = ?, report_dentist = ? WHERE id = ?`
);

let fixed = 0;
db.transaction(() => {
  for (const r of records) {
    const patient = getPatient.get(r.patient_id);
    if (!patient) continue;
    const wanted = r.record_date ? fieldForPatient(patient, r.patient_type) : null;
    if ((wanted || null) === (r.report_field || null)) continue;
    revertServiceRecord(r);
    const snap = applyServiceRecord({ patient, recordDate: r.record_date, dentist: r.dentist, patientType: r.patient_type });
    save.run(snap.report_month, snap.report_field, snap.report_barangay, snap.report_dentist, r.id);
    console.log(`#${r.id} ${patient.name} (${r.record_date}, ${r.patient_type || "no type"}): ${r.report_field || "-"} -> ${snap.report_field || "-"}`);
    fixed++;
  }
})();
console.log(fixed ? `Done. Re-tallied ${fixed} record(s).` : "Nothing to fix — all records already match.");