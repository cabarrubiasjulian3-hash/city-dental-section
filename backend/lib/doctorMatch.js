// Doctor <-> patient "assignment" is NOT a hard foreign key anywhere in this
// schema — it's inferred by matching a doctor account's own `name` against
// the free-text `dentist` field admin/doctor types into a dental_records row
// (the same field the Monthly Report and Patient Management already use).
// This keeps the existing "just type the dentist's name" workflow working
// while still letting a doctor's login see (and message) only their own
// patients, without requiring a schema change / a separate assignment step.

// Normalizes a name for comparison: lowercase, strips a leading title
// ("Dr.", "Dr", or "Doctor"), drops periods/commas, and collapses
// whitespace. "Dr. Ana Lopez", "Doctor Ana Lopez", "ANA LOPEZ", and
// "ana lopez" all normalize to the same string. Doctor accounts are
// commonly signed up with the title typed out in full ("Doctor ...")
// rather than abbreviated, so both forms need to be stripped here — a
// doctor account name only ever missing the "Dr." case previously meant
// their patients silently failed to match anywhere this function is used.
export function normalizeDoctorName(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/^(dr\.?|doctor)\s+/i, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function doctorNamesMatch(a, b) {
  const na = normalizeDoctorName(a);
  const nb = normalizeDoctorName(b);
  return Boolean(na) && Boolean(nb) && na === nb;
}

// Every patient_id that has at least one dental_records row whose `dentist`
// text matches this doctor's account name.
export function getDoctorPatientIds(db, doctorName) {
  const rows = db
    .prepare(`SELECT DISTINCT patient_id, dentist FROM dental_records WHERE dentist IS NOT NULL AND dentist != ''`)
    .all();
  const ids = new Set();
  for (const r of rows) {
    if (doctorNamesMatch(r.dentist, doctorName)) ids.add(r.patient_id);
  }
  return ids;
}

// For admin's Messages list: which doctor (by name) is "assigned" to a given
// patient, based on their most recent visit's dentist field. If that text
// happens to match a real doctor *account*, we show the account's own name
// (so it's consistent even if the record was typed a little differently);
// otherwise we just show the raw text that was typed in, since it's still
// useful context even without a matching login. Returns null if the patient
// has no dentist on file yet.
export function getAssignedDoctorLabel(db, patientId, doctorAccounts) {
  const latest = db
    .prepare(
      `SELECT dentist FROM dental_records WHERE patient_id = ? AND dentist IS NOT NULL AND dentist != ''
       ORDER BY record_date DESC, id DESC LIMIT 1`
    )
    .get(patientId);
  if (!latest || !latest.dentist) return null;
  const match = doctorAccounts.find((d) => doctorNamesMatch(d.name, latest.dentist));
  return match ? match.name : latest.dentist;
}