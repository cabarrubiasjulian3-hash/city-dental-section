import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, Clock, Stethoscope, CalendarDays, ChevronRight, Users } from "lucide-react";
import { api } from "../../lib/api";
import { EmptyState } from "../../components/ui";
import Modal from "../../components/Modal";
import { effectiveStatus, manilaToday, manilaMinutes } from "../../lib/scheduleStatus";

function formatShortDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

function formatLongDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// "Brgy. Camaysa" for a barangay visit, plain "City Dental Office" when the
// service is held at the clinic.
function placeLabel(name) {
  return name === "City Dental Office" ? name : `Brgy. ${name}`;
}

// A short label for the closed box — the first service listed, or a
// fallback, so every box reads like "Tooth Extraction · Camaysa · Oct 4, 2026".
function boxLabel(s) {
  if (s.services) return s.services.split(",")[0].trim();
  return "Barangay Visit";
}

function dateParts(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: d.getDate(),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    monthKey: dateStr.slice(0, 7),
    monthLabel: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

function dayDiff(dateStr, todayStr) {
  return Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${todayStr}T00:00:00Z`)) / 864e5);
}

function whenLabel(diff) {
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `In ${diff} days`;
}

// The visible status is automatic (date + end of the time range, see
// lib/scheduleStatus.js) — the same rule the Admin/Doctor Barangay Schedule uses, so a
// patient sees the same status they would. "Completed" and "Not Completed"
// visits are past, and patients don't need to see those here.
const STATUS_STYLES = {
  Ongoing: "bg-green-100 text-green-800 border border-green-300",
  Upcoming: "bg-amber-100 text-amber-800 border border-amber-300",
};

function StatusPill({ status, className = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        STATUS_STYLES[status] || STATUS_STYLES.Upcoming
      } ${className}`}
    >
      {status === "Ongoing" && <span className="ps-live h-1.5 w-1.5 rounded-full bg-green-600" />}
      {status}
    </span>
  );
}

// One closed box: shows only what the patient needs to recognize it at a
// glance (service, barangay, date). Tap it to open the full details in a
// pop-up, view-only — no editing, same as the admin's pop-up look.
function ScheduleBox({ s, status, diff, isNext, index, onOpen }) {
  const dp = dateParts(s.visit_date);
  const live = status === "Ongoing";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`ps-rise ps-card group relative flex w-full items-stretch gap-4 rounded-2xl border bg-cream-50 p-3.5 text-left ${
        live ? "border-green-300" : isNext ? "border-forest-700" : "border-cream-200"
      }`}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
    >
      {isNext && !live && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-[#26401e] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ebebc2]">
          Next visit
        </span>
      )}
      <div
        className={`flex w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-xl py-2 ${
          live ? "bg-green-600 text-white" : "bg-[#26401e] text-[#ebebc2]"
        }`}
      >
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${live ? "text-white/80" : "text-leaf-300"}`}>{dp.month}</span>
        <span className="font-display text-2xl font-extrabold leading-none">{dp.day}</span>
        <span className="mt-0.5 text-[10px] opacity-70">{dp.weekday}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 font-display font-semibold text-forest-950">
            <Stethoscope size={15} className="ps-ico shrink-0 text-forest-600" />
            <span className="truncate">{boxLabel(s)}</span>
          </p>
          <StatusPill status={status} />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-forest-800">
          <MapPin size={13} className="shrink-0 text-forest-500" />
          <span className="truncate">{placeLabel(s.barangay_name)}</span>
        </p>
        <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-forest-600">
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="shrink-0" />
            {s.time_range || formatShortDate(s.visit_date)}
          </span>
          <span className="flex items-center gap-0.5 font-semibold text-forest-800">
            {whenLabel(diff)}
            <ChevronRight size={14} className="ps-arrow" />
          </span>
        </p>
      </div>
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

  const [today, setToday] = useState(manilaToday);
  const [nowMin, setNowMin] = useState(manilaMinutes);
  useEffect(() => {
    const id = setInterval(() => {
      setToday(manilaToday());
      setNowMin(manilaMinutes());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Only what's actually upcoming or happening today — no past schedule here.
  const active = useMemo(() => {
    return schedules
      .map((s) => ({ s, status: effectiveStatus(s, today, nowMin) }))
      .filter(({ status }) => status === "Upcoming" || status === "Ongoing")
      .sort((a, b) => a.s.visit_date.localeCompare(b.s.visit_date));
  }, [schedules, today, nowMin]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter(({ s }) =>
      [s.barangay_name, s.services, s.location, s.barangays_served, formatShortDate(s.visit_date), s.visit_date].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [active, search]);

  // Grouped by month so a long list stays easy to scan.
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of visible) {
      const dp = dateParts(item.s.visit_date);
      if (!map.has(dp.monthKey)) map.set(dp.monthKey, { label: dp.monthLabel, items: [] });
      map.get(dp.monthKey).items.push(item);
    }
    return [...map.values()];
  }, [visible]);

  const nextItem = active[0];
  const ongoingCount = active.filter((a) => a.status === "Ongoing").length;
  const selectedDiff = selected ? dayDiff(selected.s.visit_date, today) : 0;
  let boxIndex = 0;

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes ps-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes ps-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes ps-live { 0% { box-shadow: 0 0 0 0 rgb(22 163 74 / 0.55); } 70% { box-shadow: 0 0 0 7px rgb(22 163 74 / 0); } 100% { box-shadow: 0 0 0 0 rgb(22 163 74 / 0); } }
        .ps-rise { animation: ps-rise 0.5s cubic-bezier(.2,.8,.2,1) both; }
        .ps-float { animation: ps-float 6s ease-in-out infinite; }
        .ps-live { animation: ps-live 1.8s ease-out infinite; }
        .ps-card { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
        .ps-card:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgb(37 53 34 / 0.12); border-color: #2f6f4f; }
        .ps-card .ps-arrow { transition: transform 0.15s ease; }
        .ps-card:hover .ps-arrow { transform: translateX(3px); }
        .ps-card .ps-ico { transition: transform 0.2s ease; }
        .ps-card:hover .ps-ico { transform: scale(1.2) rotate(-8deg); }
        @media (prefers-reduced-motion: reduce) { .ps-rise, .ps-float, .ps-live { animation: none !important; } .ps-card, .ps-card * { transition: none !important; } }
        .cds-reduce-motion .ps-rise, .cds-reduce-motion .ps-float, .cds-reduce-motion .ps-live { animation: none !important; }
        .cds-reduce-motion .ps-card, .cds-reduce-motion .ps-card * { transition: none !important; }
      `}</style>

      {/* ---------- Header banner ---------- */}
      <div className="ps-rise relative overflow-hidden rounded-3xl bg-[#26401e] px-6 py-6 text-[#ebebc2] sm:px-8">
        <span className="ps-float pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-leaf-300/10" />
        <span className="ps-float pointer-events-none absolute -bottom-14 right-28 h-36 w-36 rounded-full bg-leaf-300/10" style={{ animationDelay: "1.5s" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-leaf-300 text-brand-900">
              <CalendarDays size={24} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold">Barangay Schedule</h2>
              <p className="mt-1 max-w-2xl text-sm text-[#ebebc2]/80">
                Which barangay the City Dental Section is visiting, and when — for services like tooth extraction, cleaning, and
                checkups. Just show up on your barangay's date; no booking needed. Tap a box to see the full details.
              </p>
            </div>
          </div>
          {!loading && !error && (
            <div className="flex gap-2">
              <div className="rounded-2xl bg-white/10 px-4 py-2 text-center">
                <p className="font-display text-2xl font-extrabold leading-none">{active.length}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[#ebebc2]/70">Scheduled</p>
              </div>
              {ongoingCount > 0 && (
                <div className="rounded-2xl bg-green-500/25 px-4 py-2 text-center">
                  <p className="font-display text-2xl font-extrabold leading-none">{ongoingCount}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[#ebebc2]/80">Happening today</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ps-rise relative max-w-md" style={{ animationDelay: "100ms" }}>
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your barangay, a service, or a date…"
          className="w-full rounded-full border border-cream-200 bg-cream-50 pl-10 pr-4 py-2.5 text-sm shadow-sm outline-none transition-shadow focus:border-forest-700 focus:shadow-md"
        />
      </div>

      {loading ? (
        <EmptyState>Loading…</EmptyState>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : groups.length ? (
        <div className="space-y-7">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="mb-3 flex items-center gap-3">
                <h3 className="font-display text-base font-bold text-forest-950">{g.label}</h3>
                <span className="rounded-full bg-cream-200 px-2.5 py-0.5 text-xs font-semibold text-forest-700">
                  {g.items.length} {g.items.length === 1 ? "visit" : "visits"}
                </span>
                <span className="h-px flex-1 bg-cream-200" />
              </div>
              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map(({ s, status }) => (
                  <ScheduleBox
                    key={s.id}
                    s={s}
                    status={status}
                    diff={dayDiff(s.visit_date, today)}
                    isNext={!search.trim() && nextItem?.s.id === s.id}
                    index={boxIndex++}
                    onOpen={() => setSelected({ s, status })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-cream-200 bg-cream-50 p-5">
          <EmptyState>
            {active.length
              ? "No schedule matches your search."
              : "No upcoming barangay schedules have been posted yet. Check back soon."}
          </EmptyState>
        </div>
      )}

      {/* View-only details pop-up — same idea as the admin's schedule pop-up,
          just nothing here can be edited. */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-4">
            <div className="flex items-start gap-4 pr-6">
              <div className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-xl py-2 ${selected.status === "Ongoing" ? "bg-green-600 text-white" : "bg-[#26401e] text-[#ebebc2]"}`}>
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{dateParts(selected.s.visit_date).month}</span>
                <span className="font-display text-2xl font-extrabold leading-none">{dateParts(selected.s.visit_date).day}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold text-forest-950">{placeLabel(selected.s.barangay_name)}</h3>
                <p className="text-sm text-forest-700">{formatLongDate(selected.s.visit_date)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {selected.status && <StatusPill status={selected.status} />}
                  <span className="text-xs font-semibold text-forest-800">{whenLabel(selectedDiff)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-cream-200 pt-3">
              {selected.s.time_range && (
                <p className="flex items-center gap-2 text-sm text-forest-800">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900"><Clock size={14} /></span>
                  {selected.s.time_range}
                </p>
              )}
              {selected.s.services && (
                <p className="flex items-center gap-2 text-sm text-forest-800">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900"><Stethoscope size={14} /></span>
                  {selected.s.services}
                </p>
              )}
              {selected.s.location && (
                <p className="flex items-center gap-2 text-sm text-forest-800">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900"><MapPin size={14} /></span>
                  {selected.s.location}
                </p>
              )}
              {selected.s.barangays_served && (
                <p className="flex items-start gap-2 text-xs text-forest-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900"><Users size={14} /></span>
                  <span className="pt-1">
                    <span className="font-semibold">Barangays that can attend:</span> {selected.s.barangays_served}
                  </span>
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