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
// Services that need 2 visits stay "Pending" while the patient still has time
// to come back, and turn "Not Completed" if the return window runs out.
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

// ---------------------------------------------------------------------------------------------
// RETURN WINDOW for the 2-visit services, counted from the 1st visit, in calendar months
// (the same way age-in-years is counted from a birthdate, not a fixed number of days).
//   - the 2nd visit counts only if it lands AT LEAST `minMonths` after the 1st (DOH e-FHSIS rule);
//   - the patient has until `maxMonths` after the 1st visit to come back.
// While that window is still open the service is "Pending". If it closes without a qualifying
// return, the service becomes "Not Completed".
// >>> To change the time range, edit these two numbers. Nothing else needs to change. <<<
export const RETURN_WINDOW = { minMonths: 4, maxMonths: 12 };

function monthsBetween(earlierDate, laterDate) {
  const a = new Date(earlierDate);
  const b = new Date(laterDate);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

// "YYYY-MM-DD" (or Date) + n calendar months, as a Date at local midnight. A 31st that does not exist in
// the target month lands on that month's last day (Aug 31 + 6 months = Feb 28/29).
function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

const startOfDay = (d) => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};

// For a 2-visit service still waiting for its 2nd visit: when the patient may come back.
// Returns { from, to } (Dates), or null if the window does not apply.
export function returnWindowFrom(firstVisitDate) {
  if (!firstVisitDate) return null;
  return {
    from: addMonths(firstVisitDate, RETURN_WINDOW.minMonths),
    to: addMonths(firstVisitDate, RETURN_WINDOW.maxMonths),
  };
}

// Status of a 1st visit that is still waiting for its 2nd.
function openVisitStatus(firstVisitDate, today) {
  const w = returnWindowFrom(firstVisitDate);
  return startOfDay(today) <= startOfDay(w.to) ? "Pending" : "Not Completed";
}

// Computes a per-record status for a patient's full service history (every dental_records row for
// that patient, any mix of procedures, in any order — this sorts internally):
//   - 1-visit services (Tooth Extraction, Tooth Consultation, E-Consultation) are "Completed" the
//     moment they are logged.
//   - For the 2-visit services (Oral Screening, Risk Assessment, Oral Prophylaxis, Fluoride Varnish
//     Application, Counseling), a 1st visit is "Pending" while the return window is open, and "Not
//     Completed" once the window has passed with no qualifying return.
//   - A 2nd visit of the SAME procedure inside the window (>= minMonths and <= maxMonths after the
//     1st) completes the pair: both rows become "Completed".
//   - A 2nd visit that is too soon (< minMonths) does not count: the earlier visit is "Not Completed"
//     and this visit becomes the new 1st, with its own window.
//   - A 2nd visit that comes after the window closed does not count either: the earlier visit is
//     "Not Completed" and this visit starts a new window.
// `today` is only for tests; it defaults to the current date.
// Returns a Map from record.id -> "Completed" | "Pending" | "Not Completed".
export function computeRecordStatuses(records, today = new Date()) {
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
        anchor = r;
        continue;
      }
      const w = returnWindowFrom(anchor.record_date);
      const when = startOfDay(r.record_date);
      if (when >= startOfDay(w.from) && when <= startOfDay(w.to)) {
        // Inside the window: the pair is done.
        statusById.set(anchor.id, "Completed");
        statusById.set(r.id, "Completed");
        anchor = null;
      } else {
        // Too soon, or too late: the earlier visit never got its pair; this visit starts over.
        statusById.set(anchor.id, "Not Completed");
        anchor = r;
      }
    }
    if (anchor) statusById.set(anchor.id, openVisitStatus(anchor.record_date, today));
  }

  return statusById;
}

// Status of a patient as a whole = the status of their LATEST service, judged against all their
// visits for that same procedure. `dates` = every record_date of that procedure (any order, or the
// comma-separated string the /patients list sends). Returns null if there is nothing to judge.
export function statusForLatestService(procedure, dates, today = new Date()) {
  const list = (Array.isArray(dates) ? dates : String(dates || "").split(","))
    .map((d) => String(d).trim().slice(0, 10))
    .filter(Boolean);
  if (!procedure || !list.length) return null;
  const records = list.map((d, i) => ({ id: i + 1, procedure, record_date: d }));
  const statuses = computeRecordStatuses(records, today);
  const latest = [...records].sort((a, b) => new Date(a.record_date) - new Date(b.record_date) || a.id - b.id).pop();
  return statuses.get(latest.id);
}

// For the "return between X and Y" hint: the open window of a patient's latest 2-visit service, or
// null when nothing is waiting for a return.
export function openReturnWindow(procedure, dates, today = new Date()) {
  if (visitsRequiredFor(procedure) <= 1) return null;
  const list = (Array.isArray(dates) ? dates : String(dates || "").split(","))
    .map((d) => String(d).trim().slice(0, 10))
    .filter(Boolean);
  if (!list.length) return null;
  const records = list.map((d, i) => ({ id: i + 1, procedure, record_date: d }));
  const statuses = computeRecordStatuses(records, today);
  const latest = [...records].sort((a, b) => new Date(a.record_date) - new Date(b.record_date) || a.id - b.id).pop();
  return statuses.get(latest.id) === "Pending" ? returnWindowFrom(latest.record_date) : null;
}