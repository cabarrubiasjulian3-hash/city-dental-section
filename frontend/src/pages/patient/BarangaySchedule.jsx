import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, Clock, Stethoscope } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import Modal from "../../components/Modal";

function formatShortDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

function formatLongDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// A short label for the closed box — the first service listed, or a
// fallback, so every box reads like "Tooth Extraction · Camaysa · Oct 4, 2026".
function boxLabel(s) {
  if (s.services) return s.services.split(",")[0].trim();
  return "Barangay Visit";
}

// The visible status is mostly automatic, based on the visit date vs today —
// mirrors the same rule the Admin/Doctor Barangay Schedule uses, so a
// patient sees the same status they would. "Completed" and "Not Completed"
// visits are past, and patients don't need to see those here.
function effectiveStatus(s, todayStr) {
  if (s.status === "Not Completed") return "Not Completed";
  if (!s.visit_date) return s.status || "Upcoming";
  if (s.visit_date === todayStr) return "Ongoing";
  if (s.visit_date < todayStr) return "Completed";
  return s.status || "Upcoming";
}

const STATUS_STYLES = {
  Ongoing: "bg-green-100 text-green-800 border border-green-300",
  Upcoming: "bg-red-100 text-red-700 border border-red-300",
};

// One closed box: shows only what the patient needs to recognize it at a
// glance (service, barangay, date). Tap it to open the full details in a
// pop-up, view-only — no editing, same as the admin's pop-up look.
function ScheduleBox({ s, status, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left border border-cream-200 rounded-xl bg-cream-50 hover:bg-cream-100 px-4 py-3 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display font-semibold text-forest-950">{boxLabel(s)}</p>
        {status && (
          <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ${STATUS_STYLES[status] || STATUS_STYLES.Upcoming}`}>
            {status}
          </span>
        )}
      </div>
      <p className="text-sm text-forest-800 mt-1">Brgy. {s.barangay_name}</p>
      <p className="text-sm text-forest-700">{formatShortDate(s.visit_date)}</p>
    </button>
  );
}

export default function PatientBarangaySchedule() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api
      .get("/barangay-schedule")
      .then(setSchedules)
      .catch((err) => setError(err.message || "Could not load the schedule."))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  // Only what's actually upcoming or happening today — no past schedule here.
  const active = useMemo(() => {
    return schedules
      .map((s) => ({ s, status: effectiveStatus(s, today) }))
      .filter(({ status }) => status === "Upcoming" || status === "Ongoing")
      .sort((a, b) => a.s.visit_date.localeCompare(b.s.visit_date));
  }, [schedules, today]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter(({ s }) =>
      [s.barangay_name, s.services, s.location, formatShortDate(s.visit_date), s.visit_date].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [active, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">Barangay Schedule</h2>
        <p className="text-sm text-forest-700 mt-1">
          A view-only schedule of which barangay the City Dental Section is visiting, and when — for services like
          tooth extraction, cleaning, and checkups. Just show up on your barangay's date; no booking needed. Tap a
          box to see the full details.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your barangay, a service, or a date…"
          className="w-full rounded-full border border-cream-200 bg-cream-100 pl-10 pr-4 py-2 text-sm outline-none focus:border-forest-700"
        />
      </div>

      <Card>
        {loading ? (
          <EmptyState>Loading…</EmptyState>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : visible.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(({ s, status }) => (
              <ScheduleBox key={s.id} s={s} status={status} onOpen={() => setSelected({ s, status })} />
            ))}
          </div>
        ) : (
          <EmptyState>
            {active.length
              ? "No schedule matches your search."
              : "No upcoming barangay schedules have been posted yet. Check back soon."}
          </EmptyState>
        )}
      </Card>

      {/* View-only details pop-up — same idea as the admin's schedule pop-up,
          just nothing here can be edited. */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <h3 className="font-display text-lg font-bold text-forest-950">Brgy. {selected.s.barangay_name}</h3>
                <p className="text-sm text-forest-700">{formatLongDate(selected.s.visit_date)}</p>
              </div>
              {selected.status && (
                <span
                  className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${
                    STATUS_STYLES[selected.status] || STATUS_STYLES.Upcoming
                  }`}
                >
                  {selected.status}
                </span>
              )}
            </div>

            <div className="border-t border-cream-200 pt-3 space-y-2">
              {selected.s.time_range && (
                <p className="text-sm text-forest-800 flex items-center gap-1.5">
                  <Clock size={14} className="text-forest-500 shrink-0" /> {selected.s.time_range}
                </p>
              )}
              {selected.s.services && (
                <p className="text-sm text-forest-800 flex items-center gap-1.5">
                  <Stethoscope size={14} className="text-forest-500 shrink-0" /> {selected.s.services}
                </p>
              )}
              {selected.s.location && (
                <p className="text-sm text-forest-800 flex items-center gap-1.5">
                  <MapPin size={14} className="text-forest-500 shrink-0" /> {selected.s.location}
                </p>
              )}
              {selected.s.notes && <p className="text-xs text-forest-700 italic">{selected.s.notes}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}