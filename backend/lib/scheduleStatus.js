import db from "../db.js";

// Barangay schedule entries complete themselves: anything still "Upcoming" or
// "Ongoing" becomes "Completed" once its visit is over.
//   - A visit on a PAST date is over -> Completed.
//   - A visit TODAY is over as soon as the END of its time range has passed
//     (e.g. "8:00 AM - 5:00 PM" -> Completed at 5:00 PM). If the time range is
//     blank or can't be read, the visit is left alone until midnight (old
//     behaviour).
// "Today" and "now" are the clinic's own clock (Philippine time), not the
// server's, so a server running in UTC doesn't flip entries 8 hours early
// or late.
//
// "Not Completed" is a deliberate, staff-set flag ("this date passed but the
// visit didn't happen") and must never be auto-flipped back to "Completed" —
// hence excluding it below, not just excluding "Completed" itself.
//
// This runs (throttled to once a minute) before every API request, at server
// start, and every minute — so the schedule pages, the patient portal, the
// Dashboard and the Monthly Report (which counts Completed community
// activities) all see up-to-date statuses without anyone editing a row.
export function todayInManila() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
}

// Current minutes since midnight in Manila (0-1439).
export function nowMinutesInManila() {
  const t = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }); // "17:05"
  const [h, m] = t.split(":").map(Number);
  return (h % 24) * 60 + m;
}

// Reads the END time of a free-text range and returns minutes since midnight,
// or null if it can't be read. Understands things like:
//   "8:00 AM - 5:00 PM", "8:00am to 5:00pm", "8AM-5PM", "8 - 5pm",
//   "8:00 - 17:00", "8:00 AM – 12:00 noon"
export function parseEndMinutes(range) {
  if (!range) return null;
  const text = String(range)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\bnoon\b/g, "12pm")
    .replace(/\bmidnight\b/g, "12am");

  const timeRe = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?\s*m\b\.?)?/g; // am/pm optional

  const times = [];
  let m;
  while ((m = timeRe.exec(text)) !== null) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 24 || min > 59) continue;
    times.push({ h, min, mer: m[3] || null });
  }
  if (times.length < 2) return null; // need a start AND an end

  const start = times[0];
  const end = times[times.length - 1];

  const to24 = (h, mer) => {
    if (mer === "p") return h < 12 ? h + 12 : h;
    if (mer === "a") return h === 12 ? 0 : h;
    return h;
  };

  let startMin;
  let endMin;

  if (start.mer && end.mer) {
    startMin = to24(start.h, start.mer) * 60 + start.min;
    endMin = to24(end.h, end.mer) * 60 + end.min;
  } else if (end.mer && !start.mer) {
    // "8 - 5pm": start borrows the end's am/pm, or flips it if that makes it start later than the end
    endMin = to24(end.h, end.mer) * 60 + end.min;
    startMin = to24(start.h, end.mer) * 60 + start.min;
    if (startMin >= endMin) startMin = to24(start.h, end.mer === "p" ? "a" : "p") * 60 + start.min;
  } else if (start.mer && !end.mer) {
    // "8am - 5": end borrows the start's am/pm, or flips it if that makes it end before the start
    startMin = to24(start.h, start.mer) * 60 + start.min;
    endMin = to24(end.h, start.mer) * 60 + end.min;
    if (endMin <= startMin) endMin = to24(end.h, start.mer === "p" ? "a" : "p") * 60 + end.min;
  } else {
    // No am/pm at all: 24-hour ("8:00 - 17:00") or shorthand ("8-5")
    const guess = (h) => (h >= 13 || h === 0 ? h : h >= 1 && h <= 6 ? h + 12 : h);
    startMin = guess(start.h) * 60 + start.min;
    endMin = guess(end.h) * 60 + end.min;
  }

  if (endMin <= startMin || endMin > 24 * 60) return null;
  return endMin;
}

const selectOpen = db.prepare(
  "SELECT id, visit_date, time_range FROM barangay_schedule WHERE substr(visit_date, 1, 10) <= ? AND status NOT IN ('Completed', 'Not Completed')"
);
const markCompleted = db.prepare("UPDATE barangay_schedule SET status = 'Completed' WHERE id = ?");

let lastRun = 0;
export function autoCompletePastSchedules({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRun < 60_000) return 0;
  lastRun = now;
  try {
    const today = todayInManila();
    const nowMin = nowMinutesInManila();
    let changed = 0;
    for (const row of selectOpen.all(today)) {
      const date = String(row.visit_date).slice(0, 10);
      let done = date < today;
      if (!done && date === today) {
        const endMin = parseEndMinutes(row.time_range);
        done = endMin !== null && nowMin >= endMin;
      }
      if (done) changed += markCompleted.run(row.id).changes;
    }
    return changed;
  } catch (err) {
    console.error("Could not auto-complete past schedules:", err.message);
    return 0;
  }
}