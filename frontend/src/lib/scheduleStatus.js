// Shared by the Admin and Patient Barangay Schedule pages so they always show
// the same status. Times are the clinic's own clock (Philippine time), not the
// browser's, so a device set to another timezone still shows the right thing.

export function manilaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // YYYY-MM-DD
}

// Minutes since midnight in Manila (0-1439).
export function manilaMinutes() {
  const t = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = t.split(":").map(Number);
  return (h % 24) * 60 + m;
}

// Reads the END time of a free-text range ("8:00 AM - 5:00 PM", "8am to 5pm",
// "8-5", "8:00 - 17:00", ...) as minutes since midnight, or null if unreadable.
// Keep in sync with backend/lib/scheduleStatus.js.
export function parseEndMinutes(range) {
  if (!range) return null;
  const text = String(range)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\bnoon\b/g, "12pm")
    .replace(/\bmidnight\b/g, "12am");

  const timeRe = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?\s*m\b\.?)?/g;
  const times = [];
  let m;
  while ((m = timeRe.exec(text)) !== null) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 24 || min > 59) continue;
    times.push({ h, min, mer: m[3] || null });
  }
  if (times.length < 2) return null;

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
    endMin = to24(end.h, end.mer) * 60 + end.min;
    startMin = to24(start.h, end.mer) * 60 + start.min;
    if (startMin >= endMin) startMin = to24(start.h, end.mer === "p" ? "a" : "p") * 60 + start.min;
  } else if (start.mer && !end.mer) {
    startMin = to24(start.h, start.mer) * 60 + start.min;
    endMin = to24(end.h, start.mer) * 60 + end.min;
    if (endMin <= startMin) endMin = to24(end.h, start.mer === "p" ? "a" : "p") * 60 + end.min;
  } else {
    const guess = (h) => (h >= 13 || h === 0 ? h : h >= 1 && h <= 6 ? h + 12 : h);
    startMin = guess(start.h) * 60 + start.min;
    endMin = guess(end.h) * 60 + end.min;
  }
  if (endMin <= startMin || endMin > 24 * 60) return null;
  return endMin;
}

// Past date -> Completed. Today -> Ongoing until the end of its time range,
// then Completed (no readable time range: stays Ongoing until midnight).
// "Not Completed" is a manual staff flag and always wins.
export function effectiveStatus(s, todayStr, nowMin) {
  if (s.status === "Not Completed") return "Not Completed";
  if (!s.visit_date) return s.status || "Upcoming";
  if (s.visit_date === todayStr) {
    const endMin = parseEndMinutes(s.time_range);
    if (endMin !== null && nowMin >= endMin) return "Completed";
    return "Ongoing";
  }
  if (s.visit_date < todayStr) return "Completed";
  return s.status || "Upcoming";
}