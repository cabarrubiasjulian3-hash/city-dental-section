// Keep in sync with backend/lib/services.js
export const SERVICE_OPTIONS = [
  { value: "", label: "Select a service…" },
  { value: "Tooth Extraction", label: "Tooth Extraction" },
  { value: "Tooth Consultation", label: "Tooth Consultation" },
  { value: "E-Consultation", label: "E-Consultation" },
  { value: "Oral Screening", label: "Oral Screening" },
  { value: "Risk Assessment", label: "Risk Assessment" },
  { value: "Oral Prophylaxis", label: "Oral Prophylaxis" },
  { value: "Fluoride Varnish Application", label: "Fluoride Varnish Application" },
  { value: "Counseling", label: "Counseling" },
];
export const SERVICES = SERVICE_OPTIONS.filter((o) => o.value).map((o) => o.value);

// How many times a patient needs to come back for the SAME procedure before
// it counts as "Completed". Anything not listed here defaults to 1 visit.
// Services that need 2 visits stay "Not Completed" (and are left out of
// counts/reports that only care about finished services) until the patient
// has that exact procedure logged twice.
export const SERVICE_VISITS_REQUIRED = {
  "Tooth Extraction": 1,
  "Tooth Consultation": 1,
  "E-Consultation": 1,
  "Oral Screening": 2,
  "Risk Assessment": 2,
  "Oral Prophylaxis": 2,
  "Fluoride Varnish Application": 2,
  "Counseling": 2,
};

export function visitsRequiredFor(procedure) {
  return SERVICE_VISITS_REQUIRED[procedure] || 1;
}

// Minimum gap (in calendar months, same way age-in-years is computed from a
// birthdate — not a fixed day count) the DOH e-FHSIS form requires between
// the 1st and 2nd visit of a 2-visit service before the 2nd visit counts.
const REQUIRED_INTERVAL_MONTHS = 4;

function monthsBetween(earlierDate, laterDate) {
  const a = new Date(earlierDate);
  const b = new Date(laterDate);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

// Computes a per-record Completed / Not Completed status for a patient's
// full service history (every dental_records row for that patient, any mix
// of procedures, in any order — this sorts internally). Mirrors the DOH
// e-FHSIS rule for 2-visit services (Oral Screening, Risk Assessment, Oral
// Prophylaxis, Fluoride Varnish Application, Counseling):
//   - 1-visit services (Tooth Extraction, Tooth Consultation, etc.) are
//     "Completed" the moment they're logged — there's nothing to wait for.
//   - The 1st visit of a 2-visit service is "Not Completed" until a
//     qualifying 2nd visit exists.
//   - A 2nd visit of the SAME procedure that lands >= 4 months after the
//     1st becomes "Completed" — and since the pair as a whole is now done,
//     the 1st visit's row is updated to "Completed" too (it's no longer
//     just "the 1st visit waiting for a pair" — the pair happened).
//   - A 2nd visit that lands < 4 months after the 1st doesn't satisfy the
//     interval: it stays "Not Completed" AND becomes the new "1st" going
//     forward, so the patient needs to return again — 4+ months from THIS
//     visit — to actually complete the service.
// Returns a Map from record.id -> "Completed" | "Not Completed", covering
// every record passed in.
export function computeRecordStatuses(records) {
  const byProcedure = new Map();
  for (const r of records) {
    if (!byProcedure.has(r.procedure)) byProcedure.set(r.procedure, []);
    byProcedure.get(r.procedure).push(r);
  }

  const statusById = new Map();

  for (const [procedure, group] of byProcedure) {
    const required = visitsRequiredFor(procedure);
    // Oldest -> newest, so pairs are evaluated in the order they actually happened.
    const sorted = [...group].sort(
      (a, b) => new Date(a.record_date) - new Date(b.record_date) || a.id - b.id
    );

    if (required <= 1) {
      for (const r of sorted) statusById.set(r.id, "Completed");
      continue;
    }

    let anchor = null; // the open "1st visit" record, waiting for its qualifying pair
    for (const r of sorted) {
      if (!anchor) {
        statusById.set(r.id, "Not Completed");
        anchor = r;
        continue;
      }
      const gap = monthsBetween(anchor.record_date, r.record_date);
      if (gap >= REQUIRED_INTERVAL_MONTHS) {
        // Pair qualifies — both the 1st and 2nd visit are "Completed".
        statusById.set(anchor.id, "Completed");
        statusById.set(r.id, "Completed");
        anchor = null; // pair closed — the next visit (if any) starts a brand-new pair
      } else {
        // Too soon to count: doesn't complete the old anchor, and resets
        // tracking by becoming the new anchor itself.
        statusById.set(r.id, "Not Completed");
        anchor = r;
      }
    }
  }

  return statusById;
}