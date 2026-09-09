import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Card, StatCard, Badge, EmptyState } from "../../components/ui";
import EditableCell from "../../components/EditableCell";
import Modal from "../../components/Modal";
import { IconCalendar } from "../../components/icons";
import { TAYABAS_BARANGAYS } from "../../lib/barangays";

const STATUS_OPTIONS = [
  { value: "Upcoming", label: "Upcoming" },
  { value: "Ongoing", label: "Ongoing" },
  { value: "Completed", label: "Completed" },
];

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

export default function AdminBarangaySchedule() {
  const [schedules, setSchedules] = useState([]);
  const [populationByBarangay, setPopulationByBarangay] = useState({});
  const [dentists, setDentists] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const [recurringRules, setRecurringRules] = useState([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState(emptyRecurringForm);
  const [recurringError, setRecurringError] = useState("");

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

  async function addSchedule(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/barangay-schedule", { ...form, target: form.target === "" ? null : form.target });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message || "Could not save that schedule entry.");
    }
  }

  async function updateSchedule(id, field, value) {
    await api.patch(`/barangay-schedule/${id}`, { [field]: value });
    load();
  }

  async function removeSchedule(id) {
    if (!window.confirm("Remove this schedule entry?")) return;
    await api.del(`/barangay-schedule/${id}`);
    load();
  }

  async function addRecurringRule(e) {
    e.preventDefault();
    setRecurringError("");
    try {
      await api.post("/recurring-schedule", {
        ...recurringForm,
        day_of_week: Number(recurringForm.day_of_week),
        target: recurringForm.target === "" ? null : recurringForm.target,
      });
      setRecurringForm(emptyRecurringForm);
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
      "Also remove this rotation's upcoming (not-yet-completed) dates from the schedule?\n\nOK = remove them too\nCancel = just stop the rotation, keep dates already posted"
    );
    await api.del(`/recurring-schedule/${id}?removeFuture=${removeFuture}`);
    load();
  }

  const upcomingCount = useMemo(() => schedules.filter((s) => s.status === "Upcoming").length, [schedules]);

  const completedThisMonthCount = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return schedules.filter((s) => s.status === "Completed" && s.visit_date?.slice(0, 7) === thisMonth).length;
  }, [schedules]);

  const notYetVisited = useMemo(() => {
    const scheduled = new Set(schedules.map((s) => s.barangay_name));
    return TAYABAS_BARANGAYS.filter((name) => !scheduled.has(name));
  }, [schedules]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest-950">Barangay Activity Schedule</h2>
          <p className="text-sm text-forest-700 mt-1">City Dental Section · rotation plan per barangay</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecurringForm(true)}
            className="flex items-center gap-2 bg-cream-100 border border-brand-900 text-forest-900 text-sm font-semibold rounded-full px-5 py-2.5 hover:bg-cream-200"
          >
            🔁 Set up weekly rotation
          </button>
          <button
            onClick={() => setShowForm(true)}
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
        <Card>
          <h3 className="font-display text-lg font-bold text-forest-950">Weekly rotations</h3>
          <p className="text-xs text-forest-700 mt-0.5 mb-4">
            Fixed dentist-per-barangay days. New dates fill in on the schedule below automatically — pause a
            rotation instead of deleting dates one by one.
          </p>
          <div className="space-y-2">
            {recurringRules.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                  r.active ? "bg-cream-100" : "bg-cream-100 opacity-50"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-forest-950">
                    Every {DAY_NAMES[r.day_of_week]} · {r.barangay_name}
                  </p>
                  <p className="text-xs text-forest-700 truncate">
                    {[r.dentist, r.services, r.time_range].filter(Boolean).join(" · ") || "No details set"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => toggleRecurringRule(r.id, !r.active)}
                    className="text-xs underline text-forest-800"
                  >
                    {r.active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => removeRecurringRule(r.id)} className="text-xs underline text-red-700">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <Card>
            <h3 className="font-display text-lg font-bold text-forest-950">Schedule</h3>
            <p className="text-xs text-forest-700 mt-0.5 mb-4">{monthRangeLabel(schedules)}</p>
            {schedules.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-forest-700 uppercase text-xs">
                    <th className="py-2 pr-2">Date</th>
                    <th className="py-2 pr-2">Barangay</th>
                    <th className="py-2 pr-2">Activity</th>
                    <th className="py-2 pr-2">Dentist</th>
                    <th className="py-2 pr-2 text-right">Target</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => {
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
                        </td>
                        <td className="py-2 pr-2 text-forest-700">
                          <EditableCell
                            value={s.dentist}
                            placeholder="Assign dentist"
                            onSave={(v) => updateSchedule(s.id, "dentist", v)}
                          />
                        </td>
                        <td className="py-2 pr-2 text-right">
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
                            value={s.status}
                            onSave={(v) => updateSchedule(s.id, "status", v)}
                          />
                          <div className="pl-2 mt-1">
                            <Badge status={s.status} />
                          </div>
                        </td>
                        <td className="py-2 text-right align-middle">
                          <button onClick={() => removeSchedule(s.id)} className="text-xs underline text-red-700">
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState>No barangay dates posted yet. Click "Add schedule" to post one.</EmptyState>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="font-display text-lg font-bold text-forest-950">Priority Barangays</h3>
            <p className="text-xs text-forest-700 mt-0.5 mb-4">
              {notYetVisited.length === 0
                ? "Zero entries this reporting month"
                : `${notYetVisited.length} ${notYetVisited.length === 1 ? "entry" : "entries"} this reporting month`}
            </p>
            {notYetVisited.length ? (
              <div className="space-y-2">
                {notYetVisited.map((name) => (
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
            ) : (
              <EmptyState>Every barangay has at least one entry on the schedule.</EmptyState>
            )}
          </Card>
        </div>
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)}>
        <h3 className="font-display text-xl font-bold text-forest-950 mb-4">Add a barangay visit date</h3>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <form onSubmit={addSchedule} className="grid sm:grid-cols-2 gap-4">
          <select
            required
            value={form.barangay_name}
            onChange={(e) => setForm((f) => ({ ...f, barangay_name: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select barangay…</option>
            {TAYABAS_BARANGAYS.map((name) => (
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
            {dentists.map((name) => (
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
            {ACTIVITY_OPTIONS.map((activity) => (
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
            Post barangay date
          </button>
        </form>
      </Modal>

      <Modal isOpen={showRecurringForm} onClose={() => setShowRecurringForm(false)}>
        <h3 className="font-display text-xl font-bold text-forest-950 mb-1">Set up a weekly rotation</h3>
        <p className="text-sm text-forest-700 mb-4">
          e.g. "Dr. Anthony Orias is in Camaysa every Monday" — new dates will appear on the schedule
          automatically, no need to re-post every week.
        </p>
        {recurringError && <p className="text-sm text-red-700 mb-3">{recurringError}</p>}
        <form onSubmit={addRecurringRule} className="grid sm:grid-cols-2 gap-4">
          <select
            required
            value={recurringForm.barangay_name}
            onChange={(e) => setRecurringForm((f) => ({ ...f, barangay_name: e.target.value }))}
            className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm"
          >
            <option value="">Select barangay…</option>
            {TAYABAS_BARANGAYS.map((name) => (
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
            {dentists.map((name) => (
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
            {ROTATION_ACTIVITY_OPTIONS.map((activity) => (
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
            Save rotation
          </button>
        </form>
      </Modal>
    </div>
  );
}