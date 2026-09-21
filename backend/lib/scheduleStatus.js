import db from "../db.js";

// Barangay schedule entries complete themselves: once the visit date has
// passed, anything still "Upcoming" or "Ongoing" becomes "Completed". The
// day of the visit itself is left alone (it can still be Upcoming/Ongoing
// until midnight). "Today" is the clinic's own date (Philippine time), not
// the server's, so a server running in UTC doesn't flip entries 8 hours early
// or late.
//
// This runs (throttled to once a minute) before every API request, at server
// start, and hourly — so the schedule pages, the patient portal, the
// Dashboard and the Monthly Report (which counts Completed community
// activities) all see up-to-date statuses without anyone editing a row.
export function todayInManila() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
}

const completePast = db.prepare(
  "UPDATE barangay_schedule SET status = 'Completed' WHERE substr(visit_date, 1, 10) < ? AND status != 'Completed'"
);

let lastRun = 0;
export function autoCompletePastSchedules({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRun < 60_000) return 0;
  lastRun = now;
  try {
    return completePast.run(todayInManila()).changes;
  } catch (err) {
    console.error("Could not auto-complete past schedules:", err.message);
    return 0;
  }
}