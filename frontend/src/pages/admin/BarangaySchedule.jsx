import { useEffect, useMemo, useState } from "react";
import { Pencil, Archive as ArchiveIcon, Pause, Play, List, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, StatCard, Badge, EmptyState } from "../../components/ui";
import EditableCell from "../../components/EditableCell";
import EditedBy from "../../components/EditedBy";
import Modal from "../../components/Modal";
import { IconCalendar } from "../../components/icons";
import { TAYABAS_BARANGAYS } from "../../lib/barangays";
import { effectiveStatus, manilaToday, manilaMinutes } from "../../lib/scheduleStatus";

const STATUS_OPTIONS = [
  { value: "Upcoming", label: "Upcoming" },
  { value: "Ongoing", label: "Ongoing" },
  { value: "Completed", label: "Completed" },
  { value: "Not Completed", label: "Not Completed" },
];

// The visible status is automatic (see lib/scheduleStatus.js): it follows the
// visit date and, on the day itself, the end of the time range — staff only
// ever need to set one thing by hand: flip it to "Not Completed" when the
// visit didn't actually happen. That flag always wins.
// Same four statuses as the table Badge, just as flat classes for the small
// calendar-day pills (no shared component since these need tighter padding).
const CALENDAR_PILL_STYLES = {
  Upcoming: "bg-cream-200 text-forest-800",
  Ongoing: "bg-clay-500 text-white",
  Completed: "bg-leaf-300 text-forest-900",
  "Not Completed": "bg-red-100 text-red-800",
};

const BARANGAY_OPTIONS = TAYABAS_BARANGAYS.map((name) => ({ value: name, label: name }));

// "Add schedule" covers any barangay activity, one-off or community-wide,
// so all 5 real services are selectable — these feed straight into the
// Dashboard's "Services Rendered" chart (Dental Mission / QIK and
// Toothbrushing Drill / Dental Education are counted once the entry is
// marked Completed).
const ACTIVITY_OPTIONS = [
  "Tooth Extraction",
  "Tooth Consultation",
  "E-Consultation / E-Konsulta",
  "Dental Mission / QIK",
  "Toothbrushing Drill / Dental Education",
];

// "Set up weekly rotation" is for the recurring, routine clinic days a
// dentist holds in a barangay — just the 3 regular clinical services.
const ROTATION_ACTIVITY_OPTIONS = ["Tooth Extraction", "Tooth Consultation", "E-Consultation / E-Konsulta"];

// Combined free-typed activity names that were on older schedule entries.
// They're left out of the Activity filter dropdown (the entries themselves
// are untouched).
const HIDDEN_FILTER_ACTIVITIES = new Set([
  "tooth extraction, consultation",
  "tooth extraction, dental cleaning, oral examination",
  "dental cleaning, filling",
  "dental examination, filling",
]);

const EMPTY_FILTERS = { from: "", to: "", barangay: "", activity: "", dentist: "", status: "" };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_OPTIONS = DAY_NAMES.map((label, value) => ({ value: String(value), label }));

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDayLabel(dateStr) {
  // dateStr is 'YYYY-MM-DD' -> "05/04/26" + weekday, matching the reference design
  const d = new Date(dateStr + "T00:00:00");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const weekday = d.toLocaleDateString("en-PH", { weekday: "short" });
  return { top: `${mm}/${dd}/${yy}`, bottom: weekday };
}

function monthRangeLabel(schedules) {
  if (!schedules.length) return "No dates posted yet";
  const dates = schedules.map((s) => s.visit_date).sort();
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[dates.length - 1] + "T00:00:00");
  const startLabel = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  const endLabel = `${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`;
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

const emptyForm = {
  barangay_name: "",
  visit_date: "",
  time_range: "",
  services: "",
  dentist: "",
  location: "",
  target: "",
  status: "Upcoming",
  notes: "",
};

const emptyRecurringForm = {
  barangay_name: "",
  day_of_week: "1",
  dentist: "",
  services: "",
  time_range: "",
  location: "",
  target: "",
  notes: "",
};

// Dropdown options for the Edit forms: always includes the value the row
// already has (even if it isn't in the standard list, e.g. older free-typed
// data), so opening Edit and saving never silently wipes a field.
function withCurrent(options, current) {
  return current && !options.includes(current) ? [current, ...options] : options;
}

export default function AdminBarangaySchedule({ readOnly = false }) {
  // Archive buttons are admin-only (the API enforces it too); archived items go
  // to the Archive page and can be restored from there.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Doctors can edit entries and pause/resume rotations; only admins archive.
  const canEdit = user?.role === "admin" || user?.role === "doctor";
  const [schedules, setSchedules] = useState([]);
  const [populationByBarangay, setPopulationByBarangay] = useState({});
  const [dentists, setDentists] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  // Which schedule entry / weekly rotation is open in the Edit form (null = the
  // form is in "add" mode), and a page-level banner for failed Remove/Edit clicks.
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [actionError, setActionError] = useState("");

  const [recurringRules, setRecurringRules] = useState([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState(emptyRecurringForm);
  const [recurringError, setRecurringError] = useState("");

  // Filters for the Schedule table (all optional; "" = no filter).
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Clinic (Philippine) date + time; re-checked every minute so a visit flips to
  // Completed at the end of its time range without needing a page refresh.
  const [todayStr, setTodayStr] = useState(manilaToday);
  const [nowMin, setNowMin] = useState(manilaMinutes);
  useEffect(() => {
    const id = setInterval(() => {
      setTodayStr(manilaToday());
      setNowMin(manilaMinutes());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // List / Calendar toggle for the Schedule card. The calendar keeps its own
  // displayed month (independent of the From/To filters) so browsing months
  // doesn't fight with a date-range filter someone may have set.
  const [view, setView] = useState("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  function shiftMonth(delta) {
    const [y, m] = calendarMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Left/Right arrow keys move a month at a time while the calendar is open —
  // standard in most task/date calendars (Google Calendar, Outlook, etc).
  useEffect(() => {
    if (view !== "calendar") return;
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") shiftMonth(-1);
      if (e.key === "ArrowRight") shiftMonth(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, calendarMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rotationsOpen, setRotationsOpen] = useState(false); // Weekly rotations list
  // Search box on the Priority Barangays card.
  const [prioritySearch, setPrioritySearch] = useState("");

  function load() {
    api.get("/barangay-schedule").then(setSchedules).catch(() => {});
    api.get("/recurring-schedule").then(setRecurringRules).catch(() => {});
    // Dentist dropdown options for Add schedule / Set up weekly rotation —
    // pulled from Staff Management so the list stays in sync with whoever
    // is actually on staff, instead of free-typed names that can drift.
    api
      .get("/staff")
      .then((data) => {
        const dentistNames = data.filter((s) => (s.role || "").toLowerCase().includes("dentist")).map((s) => s.name);
        setDentists(dentistNames.length ? dentistNames : data.map((s) => s.name));
      })
      .catch(() => {});
    // Population comes from the e-FHSIS Monthly Report's barangay rows, so
    // "Priority Barangays" can show how many residents a skipped barangay has.
    const month = new Date().toISOString().slice(0, 7);
    api
      .get(`/monthly-reports?month=${month}&scope=barangay`)
      .then((data) => {
        const map = {};
        for (const row of data.rows || []) map[row.scope_name] = row.projected_population;
        setPopulationByBarangay(map);
      })
      .catch(() => {});
  }
  useEffect(load, []);

  function openAddSchedule() {
    setEditingScheduleId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  // "Edit" button on a schedule row: opens the same form as "Add schedule",
  // pre-filled with that row's details.
  function openEditSchedule(s) {
    setEditingScheduleId(s.id);
    setForm({
      barangay_name: s.barangay_name || "",
      visit_date: s.visit_date || "",
      time_range: s.time_range || "",
      services: s.services || "",
      dentist: s.dentist || "",
      location: s.location || "",
      target: s.target ?? "",
      status: s.status || "Upcoming",
      notes: s.notes || "",
    });
    setError("");
    setShowForm(true);
  }

  async function saveSchedule(e) {
    e.preventDefault();
    setError("");
    const body = { ...form, target: form.target === "" ? null : form.target };
    try {
      if (editingScheduleId) {
        await api.patch(`/barangay-schedule/${editingScheduleId}`, body);
      } else {
        await api.post("/barangay-schedule", body);
      }
      setForm(emptyForm);
      setEditingScheduleId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message || "Could not save that schedule entry.");
    }
  }

  async function updateSchedule(id, field, value) {
    setActionError("");
    try {
      await api.patch(`/barangay-schedule/${id}`, { [field]: value });
      load();
    } catch (err) {
      // Surface it instead of failing silently — otherwise a rejected save
      // (e.g. the field reverting) looks like the row vanished.
      setActionError(err.message || "Could not save that change.");
      throw err;
    }
  }

  async function removeSchedule(id) {
    if (!window.confirm("Move this schedule entry to the Archive?\n\nYou can restore it from the Archive page.")) return;
    setActionError("");
    try {
      await api.del(`/barangay-schedule/${id}`);
      load();
    } catch (err) {
      setActionError(err.message || "Could not remove that schedule entry.");
    }
  }

  function openAddRule() {
    setEditingRuleId(null);
    setRecurringForm(emptyRecurringForm);
    setRecurringError("");
    setShowRecurringForm(true);
  }

  // "Edit" button on a weekly rotation: same form as "Set up weekly rotation",
  // pre-filled with that rotation's details.
  function openEditRule(r) {
    setEditingRuleId(r.id);
    setRecurringForm({
      barangay_name: r.barangay_name || "",
      day_of_week: String(r.day_of_week ?? 1),
      dentist: r.dentist || "",
      services: r.services || "",
      time_range: r.time_range || "",
      location: r.location || "",
      target: r.target ?? "",
      notes: r.notes || "",
    });
    setRecurringError("");
    setShowRecurringForm(true);
  }

  async function saveRecurringRule(e) {
    e.preventDefault();
    setRecurringError("");
    const body = {
      ...recurringForm,
      day_of_week: Number(recurringForm.day_of_week),
      target: recurringForm.target === "" ? null : recurringForm.target,
    };
    try {
      if (editingRuleId) {
        await api.patch(`/recurring-schedule/${editingRuleId}`, body);
      } else {
        await api.post("/recurring-schedule", body);
      }
      setRecurringForm(emptyRecurringForm);
      setEditingRuleId(null);
      setShowRecurringForm(false);
      load();
    } catch (err) {
      setRecurringError(err.message || "Could not save that rotation.");
    }
  }

  async function toggleRecurringRule(id, active) {
    await api.patch(`/recurring-schedule/${id}`, { active: active ? 1 : 0 });
    load();
  }

  async function removeRecurringRule(id) {
    const removeFuture = window.confirm(
      "Move this weekly rotation to the Archive.\n\nAlso move its upcoming (not-yet-completed) dates?\n\nOK = move them too\nCancel = just stop the rotation, keep dates already posted"
    );
    setActionError("");
    try {
      await api.del(`/recurring-schedule/${id}?removeFuture=${removeFuture}`);
      load();
    } catch (err) {
      setActionError(err.message || "Could not remove that rotation.");
    }
  }

  const upcomingCount = useMemo(() => schedules.filter((s) => effectiveStatus(s, todayStr, nowMin) === "Upcoming").length, [schedules, todayStr, nowMin]);

  const completedThisMonthCount = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return schedules.filter((s) => effectiveStatus(s, todayStr, nowMin) === "Completed" && s.visit_date?.slice(0, 7) === thisMonth).length;
  }, [schedules]);

  // Dropdown choices for the filters: whatever is actually on the schedule,
  // plus the standard activities / everyone in Staff Management.
  const filterOptions = useMemo(() => {
    const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      barangays: uniq(schedules.map((s) => s.barangay_name)),
      activities: uniq([...ACTIVITY_OPTIONS, ...schedules.map((s) => s.services)]).filter(
        (a) => !HIDDEN_FILTER_ACTIVITIES.has(a.trim().toLowerCase())
      ),
      dentists: uniq([...dentists, ...schedules.map((s) => s.dentist)]),
    };
  }, [schedules, dentists]);

  const filtersActive = Object.values(filters).some(Boolean);
  // Filters tucked inside the collapsible panel (dates stay visible in the bar).
  const extraFilterCount = [filters.barangay, filters.activity, filters.dentist, filters.status].filter(Boolean).length;

  // Upcoming/Ongoing first (soonest date first), Completed last (most recently
  // completed first) — so what still needs doing stays at the top of the list.
  const STATUS_RANK = { Ongoing: 0, Upcoming: 0, Completed: 1, "Not Completed": 1 };
  const filteredSchedules = useMemo(
    () =>
      schedules
        .filter((s) => {
          if (filters.from && (s.visit_date || "") < filters.from) return false;
          if (filters.to && (s.visit_date || "") > filters.to) return false;
          if (filters.barangay && s.barangay_name !== filters.barangay) return false;
          if (filters.activity && s.services !== filters.activity) return false;
          if (filters.dentist && s.dentist !== filters.dentist) return false;
          if (filters.status && effectiveStatus(s, todayStr, nowMin) !== filters.status) return false;
          return true;
        })
        .sort((a, b) => {
          const aStatus = effectiveStatus(a, todayStr, nowMin);
          const bStatus = effectiveStatus(b, todayStr, nowMin);
          const rankDiff = (STATUS_RANK[aStatus] ?? 0) - (STATUS_RANK[bStatus] ?? 0);
          if (rankDiff !== 0) return rankDiff;
          const dateDiff = (a.visit_date || "").localeCompare(b.visit_date || "");
          // Same tier: Upcoming/Ongoing soonest-first, Completed/Not Completed most-recent-first.
          return aStatus === "Upcoming" || aStatus === "Ongoing" ? dateDiff : -dateDiff;
        }),
    [schedules, filters, todayStr, nowMin]
  );

  // Builds one grid of Sun–Sat weeks for the displayed month, each day
  // carrying whichever filtered schedule entries fall on that date.
  const calendarWeeks = useMemo(() => {
    const [y, m] = calendarMonth.split("-").map(Number);
    const byDate = new Map();
    for (const s of filteredSchedules) {
      if (!s.visit_date) continue;
      if (!byDate.has(s.visit_date)) byDate.set(s.visit_date, []);
      byDate.get(s.visit_date).push(s);
    }
    const daysInMonth = new Date(y, m, 0).getDate();
    const startWeekday = new Date(y, m - 1, 1).getDay();
    const cells = Array(startWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ date, day: d, items: byDate.get(date) || [] });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [calendarMonth, filteredSchedules]);
  const calendarMonthLabel = new Date(`${calendarMonth}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  function setFilter(field, value) {
    setFilters((f) => ({ ...f, [field]: value }));
  }

  const notYetVisited = useMemo(() => {
    const scheduled = new Set(schedules.map((s) => s.barangay_name));
    return TAYABAS_BARANGAYS.filter((name) => !scheduled.has(name));
  }, [schedules]);

  // Priority Barangays search: matches any part of the name, ignoring case
  // and a leading "Barangay"/"Brgy." ("ilaya", "brgy alupay" both work).
  const visiblePriority = useMemo(() => {
    const q = prioritySearch
      .toLowerCase()
      .replace(/\b(barangay|brgy\.?)\b/g, "")
      .trim();
    if (!q) return notYetVisited;
    return notYetVisited.filter((name) => name.toLowerCase().includes(q));
  }, [notYetVisited, prioritySearch]);

  return (
    <div className="space-y-6">
    <fieldset disabled={readOnly} style={{ display: "contents" }}>
    <div className="space-y-6">
      {readOnly && (
        <div className="bg-clay-500/10 border border-clay-500 text-forest-900 text-sm rounded-lg px-3 py-2">
          Preview only — doctor accounts can view the barangay schedule but cannot make changes.
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{actionError}</div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest-950">Barangay Activity Schedule</h2>
          <p className="text-sm text-forest-700 mt-1">City Dental Section · rotation plan per barangay</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openAddRule}
            className="flex items-center gap-2 bg-cream-100 border border-brand-900 text-forest-900 text-sm font-semibold rounded-full px-5 py-2.5 hover:bg-cream-200"
          >
            🔁 Set up weekly rotation
          </button>
          <button
            onClick={openAddSchedule}
            className="flex items-center gap-2 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-5 py-2.5 hover:bg-brand-800"
          >
            <IconCalendar className="w-4 h-4" />
            Add schedule
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Upcoming activities" value={upcomingCount} />
        <StatCard label="Completed this month" value={completedThisMonthCount} />
        <StatCard label="Barangays not yet visited" value={notYetVisited.length} />
      </div>

      {recurringRules.length > 0 && (
        <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p
              className="text-sm font-semibold text-forest-950"
              title="Fixed dentist-per-barangay days. New dates fill in on the schedule below automatically — pause a rotation instead of removing dates one by one."
            >
              Weekly rotations{" "}
              <span className="font-normal text-xs text-forest-700">
                · {recurringRules.filter((r) => r.active).length} active of {recurringRules.length}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setRotationsOpen((v) => !v)}
              aria-expanded={rotationsOpen}
              className="text-xs font-semibold rounded-full bg-cream-100 border border-cream-200 text-forest-900 hover:bg-cream-200 px-3 py-1"
            >
              {rotationsOpen ? "Hide" : "Show"} <span aria-hidden="true">{rotationsOpen ? "▴" : "▾"}</span>
            </button>
          </div>
          {rotationsOpen && (
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
            {recurringRules.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 ${
                  r.active ? "bg-cream-100" : "bg-cream-100 opacity-50"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-forest-950">
                    Every {DAY_NAMES[r.day_of_week]} · {r.barangay_name}
                  </p>
                  <p className="text-xs text-forest-700 truncate">
                    {[r.dentist, r.services, r.time_range].filter(Boolean).join(" · ") || "No details set"}
                  </p>
                  <EditedBy row={r} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title={r.active ? "Pause rotation" : "Resume rotation"}
                    aria-label={r.active ? "Pause rotation" : "Resume rotation"}
                    onClick={() => toggleRecurringRule(r.id, !r.active)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-forest-800 hover:bg-cream-200"
                  >
                    {r.active ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      title="Edit rotation"
                      aria-label="Edit rotation"
                      onClick={() => openEditRule(r)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-forest-800 hover:bg-cream-200"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      title="Archive rotation"
                      aria-label="Archive rotation"
                      onClick={() => removeRecurringRule(r.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-red-700 hover:bg-red-50"
                    >
                      <ArchiveIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

    </div>
    </fieldset>

      {/* Filters live OUTSIDE the read-only fieldset on purpose: doctors can't
          edit the schedule, but they can still filter it. */}
      {/* Slim filter bar: dates inline, the rest tucked into a "Filters" panel. */}
      <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-forest-700">
          <span className="font-semibold text-forest-950">
            Showing {filteredSchedules.length} of {schedules.length}
          </span>
          <label className="flex items-center gap-1.5">
            From
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter("from", e.target.value)}
              className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950"
            />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter("to", e.target.value)}
              className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950"
            />
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
              extraFilterCount ? "bg-brand-900 text-brand-50" : "bg-cream-100 border border-cream-200 text-forest-900 hover:bg-cream-200"
            }`}
          >
            Filters{extraFilterCount ? ` (${extraFilterCount})` : ""} <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span>
          </button>
          {filtersActive && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="font-semibold underline hover:text-forest-950">
              Clear
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mt-2 pt-2 border-t border-cream-200 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-forest-700">
            <label className="flex items-center gap-1.5">
              Barangay
              <select value={filters.barangay} onChange={(e) => setFilter("barangay", e.target.value)} className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950">
                <option value="">All</option>
                {filterOptions.barangays.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Activity
              <select value={filters.activity} onChange={(e) => setFilter("activity", e.target.value)} className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950">
                <option value="">All</option>
                {filterOptions.activities.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Dentist
              <select value={filters.dentist} onChange={(e) => setFilter("dentist", e.target.value)} className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950">
                <option value="">All</option>
                {filterOptions.dentists.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Status
              <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className="rounded-lg border border-cream-200 bg-cream-100 px-2 py-1 text-xs text-forest-950">
                <option value="">All</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

    <fieldset disabled={readOnly} style={{ display: "contents" }}>
      <div className="mt-6 grid lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-0.5">
              <div className="shrink-0">
                <h3 className="font-display text-lg font-bold text-forest-950">Schedule</h3>
                <p className="text-xs text-forest-700 mt-0.5">{view === "list" && monthRangeLabel(schedules)}</p>
              </div>

              {/* Month + arrows: same row as "Schedule" and the List/Calendar
                  toggle, centered between them. */}
              {view === "calendar" && (
                <div className="flex items-center justify-center gap-3 order-last sm:order-none basis-full sm:basis-0 sm:flex-1">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cream-200 text-forest-800 hover:bg-cream-200"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <h4 className="font-display text-lg font-bold text-forest-950 text-center min-w-[9rem]">
                    {calendarMonthLabel}
                  </h4>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-cream-200 text-forest-800 hover:bg-cream-200"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}

              <div className="inline-flex rounded-full border border-cream-200 bg-cream-100 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  aria-pressed={view === "list"}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${
                    view === "list" ? "bg-forest-900 text-cream-50" : "text-forest-800 hover:bg-cream-200"
                  }`}
                >
                  <List size={14} /> List
                </button>
                <button
                  type="button"
                  onClick={() => setView("calendar")}
                  aria-pressed={view === "calendar"}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${
                    view === "calendar" ? "bg-forest-900 text-cream-50" : "text-forest-800 hover:bg-cream-200"
                  }`}
                >
                  <CalendarDays size={14} /> Calendar
                </button>
              </div>
            </div>
            {view === "list" && <div className="mb-4" />}
            {view === "list" && filteredSchedules.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-forest-700 uppercase text-xs">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Time</th>
                    <th className="py-2 pr-2">Barangay</th>
                    <th className="py-2 pr-2">Activity</th>
                    <th className="py-2 pr-2">Dentist</th>
                    <th className="py-2 pr-8 text-right">Target</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.map((s) => {
                    const day = formatDayLabel(s.visit_date);
                    return (
                      <tr key={s.id} className="border-t border-cream-200 align-top">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          <EditableCell
                            type="date"
                            value={s.visit_date}
                            onSave={(v) => updateSchedule(s.id, "visit_date", v)}
                          />
                          <p className="text-xs text-forest-500 pl-2">{day.bottom}</p>
                        </td>
                        <td className="py-2 pr-2 text-forest-700 whitespace-nowrap">
                          <EditableCell
                            value={s.time_range}
                            placeholder="8:00 AM - 5:00 PM"
                            onSave={(v) => updateSchedule(s.id, "time_range", v)}
                          />
                        </td>
                        <td className="py-2 pr-2 font-medium">
                          <EditableCell
                            type="select"
                            options={BARANGAY_OPTIONS}
                            value={s.barangay_name}
                            onSave={(v) => updateSchedule(s.id, "barangay_name", v)}
                          />
                          {s.recurring_rule_id && (
                            <p className="text-[10px] text-forest-500 pl-2">🔁 Weekly</p>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-forest-700">
                          <EditableCell
                            value={s.services}
                            placeholder="e.g. Dental Mission / QIK"
                            onSave={(v) => updateSchedule(s.id, "services", v)}
                          />
                          <EditedBy row={s} className="pl-2" />
                        </td>
                        <td className="py-2 pr-2 text-forest-700">
                          <EditableCell
                            value={s.dentist}
                            placeholder="Assign dentist"
                            onSave={(v) => updateSchedule(s.id, "dentist", v)}
                          />
                        </td>
                        <td className="py-2 pr-8 text-right">
                          <EditableCell
                            type="number"
                            value={s.target ?? ""}
                            placeholder="—"
                            className="text-right"
                            onSave={(v) => updateSchedule(s.id, "target", v === "" ? null : v)}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <EditableCell
                            type="select"
                            options={STATUS_OPTIONS}
                            value={effectiveStatus(s, todayStr, nowMin)}
                            renderDisplay={(v) => <Badge status={v} />}
                            onSave={(v) => updateSchedule(s.id, "status", v)}
                          />
                        </td>
                        <td className="py-2 text-right align-middle">
                          {canEdit && (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                title="Edit schedule entry"
                                aria-label="Edit schedule entry"
                                onClick={() => openEditSchedule(s)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-forest-800 hover:bg-cream-200"
                              >
                                <Pencil size={14} />
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  title="Archive schedule entry"
                                  aria-label="Archive schedule entry"
                                  onClick={() => removeSchedule(s.id)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-red-700 hover:bg-red-50"
                                >
                                  <ArchiveIcon size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : view === "list" ? (
              <EmptyState>
                {schedules.length
                  ? "No scheduled dates match these filters."
                  : 'No barangay dates posted yet. Click "Add schedule" to post one.'}
              </EmptyState>
            ) : (
              <div>
                {/* Today (left) and the color key (right) on their own thin row. */}
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(new Date().toISOString().slice(0, 7))}
                    className="text-xs font-semibold rounded-full border border-cream-200 bg-cream-100 text-forest-800 hover:bg-cream-200 px-3 py-1.5"
                  >
                    Today
                  </button>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-forest-700">
                    {STATUS_OPTIONS.map((o) => (
                      <span key={o.value} className="flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${(CALENDAR_PILL_STYLES[o.value] || "").split(" ")[0]}`}
                        />
                        {o.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-forest-500 uppercase mb-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarWeeks.flat().map((cell, i) =>
                    cell ? (
                      <div
                        key={cell.date}
                        className={`flex flex-col min-h-[6rem] rounded-lg border px-1.5 py-1 text-left ${
                          cell.date === todayStr ? "border-forest-700 bg-cream-100" : "border-cream-200 bg-cream-50"
                        }`}
                      >
                        <p className={`text-[11px] mb-1 shrink-0 ${cell.date === todayStr ? "font-bold text-forest-950" : "text-forest-500"}`}>
                          {cell.day}
                        </p>
                        {/* Each entry fills the box with its status color (not just a small
                            label inside it) — with one entry that means the whole remaining
                            cell is that color, like a day-planner / task calendar. */}
                        <div className="flex-1 flex flex-col gap-1 min-h-0">
                          {cell.items.slice(0, 3).map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => canEdit && openEditSchedule(s)}
                              title={`${s.barangay_name} — ${s.services || "No details"} — ${effectiveStatus(s, todayStr, nowMin)}`}
                              className={`flex-1 min-h-[1.25rem] w-full flex items-center justify-center text-center rounded-md px-1 py-1 text-[10px] font-bold leading-tight ${
                                CALENDAR_PILL_STYLES[effectiveStatus(s, todayStr, nowMin)] ?? CALENDAR_PILL_STYLES.Upcoming
                              } ${canEdit ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                            >
                              <span className="truncate">{s.barangay_name}</span>
                            </button>
                          ))}
                          {cell.items.length > 3 && (
                            <p className="text-[10px] text-forest-500 pl-0.5 shrink-0">+{cell.items.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div key={`blank-${i}`} />
                    )
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Priority Barangays: on wide screens this card is exactly as tall as
            the Schedule card beside it (absolute inset-0 keeps it from making
            the row taller) and the list scrolls inside it; on narrow screens
            it just gets a max height. */}
        <div className="relative lg:min-h-[420px]">
          <Card className="flex flex-col max-h-[520px] lg:max-h-none lg:absolute lg:inset-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold text-forest-950">Priority Barangays</h3>
                <p className="text-xs text-forest-700 mt-0.5">
                  {notYetVisited.length === 0
                    ? "Zero entries this reporting month"
                    : prioritySearch.trim()
                    ? `${visiblePriority.length} of ${notYetVisited.length} entries`
                    : `${notYetVisited.length} ${notYetVisited.length === 1 ? "entry" : "entries"} this reporting month`}
                </p>
              </div>
              {notYetVisited.length > 0 && (
                <input
                  type="search"
                  value={prioritySearch}
                  onChange={(e) => setPrioritySearch(e.target.value)}
                  placeholder="Search barangay"
                  aria-label="Search priority barangays"
                  className="rounded-full bg-cream-100 border border-cream-300 text-forest-950 text-xs px-3 py-1.5 w-40 focus:outline-none focus:border-forest-700"
                />
              )}
            </div>
            <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1">
              {visiblePriority.length ? (
                <div className="space-y-2">
                  {visiblePriority.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between gap-2 bg-cream-100 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-forest-700 shrink-0">📍</span>
                        <span className="font-medium text-forest-950 truncate">{name}</span>
                      </div>
                      <span className="text-xs text-forest-700 whitespace-nowrap">
                        {populationByBarangay[name] ? `Pop. ${populationByBarangay[name]}` : "Pop. —"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : notYetVisited.length ? (
                <EmptyState>No barangay matches that search.</EmptyState>
              ) : (
                <EmptyState>Every barangay has at least one entry on the schedule.</EmptyState>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)}>
        <h3 className="font-display text-xl font-bold text-forest-950 mb-4">
          {editingScheduleId ? "Edit barangay visit date" : "Add a barangay visit date"}
        </h3>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <form onSubmit={saveSchedule} className="grid sm:grid-cols-2 gap-4">
          <select
            required
            value={form.barangay_name}
            onChange={(e) => setForm((f) => ({ ...f, barangay_name: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select barangay…</option>
            {withCurrent(TAYABAS_BARANGAYS, form.barangay_name).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="date"
            required
            value={form.visit_date}
            onChange={(e) => setForm((f) => ({ ...f, visit_date: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <input
            placeholder="Time range (e.g. 8:00 AM - 12:00 PM)"
            value={form.time_range}
            onChange={(e) => setForm((f) => ({ ...f, time_range: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <select
            value={form.dentist}
            onChange={(e) => setForm((f) => ({ ...f, dentist: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select dentist…</option>
            {withCurrent(dentists, form.dentist).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={form.services}
            onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select activity…</option>
            {withCurrent(ACTIVITY_OPTIONS, form.services).map((activity) => (
              <option key={activity} value={activity}>
                {activity}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            placeholder="Target headcount"
            value={form.target}
            onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            className="sm:col-span-2 rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            placeholder="Location (e.g. Barangay Hall)"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            className="sm:col-span-2 rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="sm:col-span-2 rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <button className="sm:col-span-2 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full py-2.5 hover:bg-brand-800">
            {editingScheduleId ? "Save changes" : "Post barangay date"}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showRecurringForm} onClose={() => setShowRecurringForm(false)}>
        <h3 className="font-display text-xl font-bold text-forest-950 mb-1">
          {editingRuleId ? "Edit weekly rotation" : "Set up a weekly rotation"}
        </h3>
        <p className="text-sm text-forest-700 mb-4">
          {editingRuleId
            ? "Changes apply to dates the rotation adds from now on. Dates already on the schedule keep their own details — edit those individually."
            : 'e.g. "Dr. Anthony Orias is in Camaysa every Monday" — new dates will appear on the schedule automatically, no need to re-post every week.'}
        </p>
        {recurringError && <p className="text-sm text-red-700 mb-3">{recurringError}</p>}
        <form onSubmit={saveRecurringRule} className="grid sm:grid-cols-2 gap-4">
          <select
            required
            value={recurringForm.barangay_name}
            onChange={(e) => setRecurringForm((f) => ({ ...f, barangay_name: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select barangay…</option>
            {withCurrent(TAYABAS_BARANGAYS, recurringForm.barangay_name).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            required
            value={recurringForm.day_of_week}
            onChange={(e) => setRecurringForm((f) => ({ ...f, day_of_week: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            {DAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Every {o.label}
              </option>
            ))}
          </select>
          <select
            value={recurringForm.dentist}
            onChange={(e) => setRecurringForm((f) => ({ ...f, dentist: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select dentist…</option>
            {withCurrent(dentists, recurringForm.dentist).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            placeholder="Time range (e.g. 8:00 AM - 12:00 PM)"
            value={recurringForm.time_range}
            onChange={(e) => setRecurringForm((f) => ({ ...f, time_range: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <select
            value={recurringForm.services}
            onChange={(e) => setRecurringForm((f) => ({ ...f, services: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select activity…</option>
            {withCurrent(ROTATION_ACTIVITY_OPTIONS, recurringForm.services).map((activity) => (
              <option key={activity} value={activity}>
                {activity}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            placeholder="Target headcount"
            value={recurringForm.target}
            onChange={(e) => setRecurringForm((f) => ({ ...f, target: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <input
            placeholder="Location (e.g. Barangay Hall)"
            value={recurringForm.location}
            onChange={(e) => setRecurringForm((f) => ({ ...f, location: e.target.value }))}
            className="sm:col-span-2 rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <input
            placeholder="Notes (optional)"
            value={recurringForm.notes}
            onChange={(e) => setRecurringForm((f) => ({ ...f, notes: e.target.value }))}
            className="sm:col-span-2 rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          />
          <button className="sm:col-span-2 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full py-2.5 hover:bg-brand-800">
            {editingRuleId ? "Save changes" : "Save rotation"}
          </button>
        </form>
      </Modal>
    </fieldset>
    </div>
  );
}