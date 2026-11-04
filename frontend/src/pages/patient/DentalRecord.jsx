import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardList, FileText, Stethoscope, User } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { EmptyState } from "../../components/ui";
import Modal from "../../components/Modal";
import ToothChart from "../../components/ToothChart";
import { AnimatedNumber } from "../../components/Charts";

// A Notes value shown as a button (like the admin side's Notes button).
// Clicking it pops up the full notes text — view only, nothing to type or
// save here. Closes with the × in the corner, by clicking outside it, or
// with Escape.
function NotesViewButton({ notes, title, onOpenChange }) {
  const hasNotes = !!(notes && String(notes).trim());
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // don't also trigger the row's "open record" click
        onOpenChange({ notes, title });
      }}
      title={hasNotes ? "View notes" : "No notes"}
      className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 px-3 py-1 text-left text-sm italic hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-forest-500 ${
        hasNotes ? "text-forest-950" : "text-forest-500"
      }`}
    >
      <FileText size={13} className="shrink-0" />
      <span className="truncate">{hasNotes ? notes : "No notes"}</span>
    </button>
  );
}

function dateParts(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: d.getDate(),
    year: d.getFullYear(),
  };
}

function Field({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-cream-100 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-forest-600">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-forest-950">{children}</div>
      </div>
    </div>
  );
}

// View-only. Patients can open any treatment record to see its details and
// their tooth chart, but nothing here can be changed: the tooth chart is
// rendered with isAdmin={false} (no click-to-edit), and the server's
// PATCH/POST/DELETE routes for records and tooth conditions only accept
// admin/doctor accounts anyway.
export default function PatientDentalRecord() {
  const { user } = useAuth();
  const location = useLocation();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  // The record whose notes are currently shown in the view-only Notes popup
  // ({ notes, title }), or null when it's closed.
  const [notesPopup, setNotesPopup] = useState(null);

  useEffect(() => {
    api
      .get("/dental-records")
      .then((rows) => {
        setRecords(rows);
        // Coming from a row on the Dashboard: open that record straight away.
        const wanted = location.state?.openRecordId;
        if (wanted) setSelected(rows.find((r) => r.id === wanted) || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grouped by year (newest first, as the API returns them) so a long history stays easy to scan.
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      const y = String(r.record_date || "").slice(0, 4) || "—";
      if (!map.has(y)) map.set(y, []);
      map.get(y).push(r);
    }
    return [...map.entries()];
  }, [records]);

  const lastVisit = records[0]?.record_date || null;
  let rowIndex = 0;

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes dr-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes dr-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes dr-line { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .dr-rise { animation: dr-rise 0.5s cubic-bezier(.2,.8,.2,1) both; }
        .dr-float { animation: dr-float 6s ease-in-out infinite; }
        .dr-line { transform-origin: top; animation: dr-line 0.9s cubic-bezier(.2,.8,.2,1) 0.2s both; }
        .dr-row { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
        .dr-row:hover, .dr-row:focus-visible { transform: translateX(4px); box-shadow: 0 8px 20px rgb(37 53 34 / 0.1); border-color: #2f6f4f; }
        .dr-row .dr-arrow { transition: transform 0.15s ease, opacity 0.15s ease; opacity: 0.4; }
        .dr-row:hover .dr-arrow { transform: translateX(3px); opacity: 1; }
        .dr-row .dr-ico { transition: transform 0.2s ease; }
        .dr-row:hover .dr-ico { transform: scale(1.12) rotate(-6deg); }
        @media (prefers-reduced-motion: reduce) { .dr-rise, .dr-float, .dr-line { animation: none !important; } .dr-row, .dr-row * { transition: none !important; } }
        .cds-reduce-motion .dr-rise, .cds-reduce-motion .dr-float, .cds-reduce-motion .dr-line { animation: none !important; }
        .cds-reduce-motion .dr-row, .cds-reduce-motion .dr-row * { transition: none !important; }
      `}</style>

      {/* ---------- Banner ---------- */}
      <div className="dr-rise relative overflow-hidden rounded-3xl bg-[#26401e] px-6 py-6 text-[#ebebc2] sm:px-8">
        <span className="dr-float pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-leaf-300/10" />
        <span className="dr-float pointer-events-none absolute -bottom-14 right-28 h-36 w-36 rounded-full bg-leaf-300/10" style={{ animationDelay: "1.5s" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-leaf-300 text-brand-900">
              <ClipboardList size={24} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold">Dental Record</h2>
              <p className="mt-1 max-w-2xl text-sm text-[#ebebc2]/80">
                Click a treatment to see its details and your tooth chart. This is for viewing only — if something looks wrong,
                please let the front desk know.
              </p>
            </div>
          </div>
          {records.length > 0 && (
            <div className="flex gap-2">
              <div className="rounded-2xl bg-white/10 px-4 py-2 text-center">
                <p className="font-display text-2xl font-extrabold leading-none tabular-nums">
                  <AnimatedNumber value={records.length} />
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[#ebebc2]/70">Treatments</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-2 text-center">
                <p className="font-display text-base font-extrabold leading-6">{lastVisit}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[#ebebc2]/70">Last visit</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Treatment history ---------- */}
      {records.length ? (
        <div className="space-y-7">
          {groups.map(([year, items]) => (
            <section key={year}>
              <div className="mb-3 flex items-center gap-3">
                <h3 className="font-display text-base font-bold text-forest-950">{year}</h3>
                <span className="rounded-full bg-cream-200 px-2.5 py-0.5 text-xs font-semibold text-forest-700">
                  {items.length} {items.length === 1 ? "treatment" : "treatments"}
                </span>
                <span className="h-px flex-1 bg-cream-200" />
              </div>
              <div className="relative space-y-3 pl-0 sm:pl-6">
                <span className="dr-line absolute bottom-3 left-[11px] top-3 hidden w-0.5 rounded-full bg-leaf-300/70 sm:block" />
                {items.map((r) => {
                  const dp = dateParts(r.record_date);
                  const i = rowIndex++;
                  return (
                    <div key={r.id} className="relative">
                      <span className="absolute -left-[22px] top-1/2 hidden h-3 w-3 -translate-y-1/2 rounded-full border-2 border-cream-100 bg-forest-700 sm:block" />
                      <div
                        onClick={() => setSelected(r)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(r)}
                        tabIndex={0}
                        role="button"
                        aria-label={`View ${r.procedure} on ${r.record_date}`}
                        className="dr-rise dr-row flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-cream-200 bg-cream-50 p-3.5 outline-none"
                        style={{ animationDelay: `${Math.min(i, 12) * 55}ms` }}
                      >
                        <div className="flex w-[4rem] shrink-0 flex-col items-center justify-center rounded-xl bg-[#26401e] py-2 text-[#ebebc2]">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-leaf-300">{dp.month}</span>
                          <span className="font-display text-2xl font-extrabold leading-none">{dp.day}</span>
                          <span className="mt-0.5 text-[10px] opacity-70">{dp.year}</span>
                        </div>
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="flex items-center gap-2 font-display font-semibold text-forest-950">
                            <span className="dr-ico flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-leaf-300/50 text-forest-900">
                              <Stethoscope size={15} />
                            </span>
                            <span className="truncate">{r.procedure}</span>
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-forest-700">
                            <User size={13} className="shrink-0 text-forest-500" />
                            {r.dentist || "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-forest-700">
                          <NotesViewButton notes={r.notes} title={`${r.procedure} · ${r.record_date}`} onOpenChange={setNotesPopup} />
                          <ChevronRight size={18} className="dr-arrow shrink-0" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-cream-200 bg-cream-50 p-5">
          <EmptyState>
            {loading ? "Loading…" : "No dental records on file yet. Records appear here after your first visit."}
          </EmptyState>
        </div>
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} size="lg">
        {selected && (
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900 mb-1">{selected.procedure}</h3>
            <p className="text-sm text-forest-700 mb-5">View only — you can't change these details.</p>

            {/* Date | Procedure | Dentist | Notes. On a narrow phone screen it wraps to one per row. */}
            <div className="mb-6 grid gap-3 border-b border-cream-200 pb-5 sm:grid-cols-2">
              <Field icon={CalendarDays} label="Date">{selected.record_date}</Field>
              <Field icon={Stethoscope} label="Procedure">{selected.procedure}</Field>
              <Field icon={User} label="Dentist">{selected.dentist || "—"}</Field>
              <Field icon={FileText} label="Notes">
                <NotesViewButton
                  notes={selected.notes}
                  title={`${selected.procedure} · ${selected.record_date}`}
                  onOpenChange={setNotesPopup}
                />
              </Field>
            </div>

            <ToothChart patientId={user.id} isAdmin={false} />
            <p className="text-xs text-forest-600 text-center mt-2">
              This is your current tooth chart on file with the clinic.
            </p>
          </div>
        )}
      </Modal>

      {/* View-only Notes popup — opened from either the list's Notes button
          or the record detail's Notes button. Nothing here is editable. */}
      <Modal isOpen={!!notesPopup} onClose={() => setNotesPopup(null)} size="md">
        {notesPopup && (
          <div>
            <h3 className="font-display text-lg font-bold text-forest-950 pr-8">Notes</h3>
            {notesPopup.title && <p className="mt-0.5 text-sm text-forest-500">{notesPopup.title}</p>}
            <p className="mt-4 whitespace-pre-line text-sm text-forest-950">
              {notesPopup.notes && String(notesPopup.notes).trim() ? notesPopup.notes : "No notes for this visit."}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}