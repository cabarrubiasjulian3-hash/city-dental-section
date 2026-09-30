import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, EmptyState } from "../../components/ui";
import Modal from "../../components/Modal";
import ToothChart from "../../components/ToothChart";

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
      className={`inline-flex max-w-[220px] items-center rounded-full border border-cream-200 bg-cream-50 px-3 py-1 text-left text-sm italic hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-forest-500 ${
        hasNotes ? "text-forest-950" : "text-forest-500"
      }`}
    >
      <span className="truncate">{hasNotes ? notes : "No notes"}</span>
    </button>
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">Dental Record</h2>
        <p className="text-sm text-forest-700 mt-1">
          Click a treatment to see its details and your tooth chart. This is for viewing only — if something
          looks wrong, please let the front desk know.
        </p>
      </div>

      <Card title="Treatment history">
        {records.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-700 uppercase text-xs">
                <th className="py-2">Date</th>
                <th className="py-2">Procedure</th>
                <th className="py-2">Dentist</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(r)}
                  tabIndex={0}
                  role="button"
                  aria-label={`View ${r.procedure} on ${r.record_date}`}
                  className="border-t border-cream-200 cursor-pointer hover:bg-cream-100 focus:bg-cream-100 outline-none"
                >
                  <td className="py-3">{r.record_date}</td>
                  <td className="py-3 font-medium text-forest-900 underline decoration-dotted">{r.procedure}</td>
                  <td className="py-3">{r.dentist || "—"}</td>
                  <td className="py-3 text-forest-700">
                    <NotesViewButton notes={r.notes} title={`${r.procedure} · ${r.record_date}`} onOpenChange={setNotesPopup} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>
            {loading
              ? "Loading…"
              : "No dental records on file yet. Records appear here after your first visit."}
          </EmptyState>
        )}
      </Card>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} size="lg">
        {selected && (
          <div>
            <h3 className="font-display text-xl font-bold text-ink-900 mb-1">{selected.procedure}</h3>
            <p className="text-sm text-forest-700 mb-5">View only — you can't change these details.</p>

            {/* One row: Date | Procedure | Dentist | Notes (label above value).
                On a narrow phone screen it wraps to two per row. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-sm mb-6 pb-5 border-b border-cream-200">
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-forest-700">Date</p>
                <p className="mt-1 text-forest-950">{selected.record_date}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-forest-700">Procedure</p>
                <p className="mt-1 text-forest-950">{selected.procedure}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-forest-700">Dentist</p>
                <p className="mt-1 text-forest-950">{selected.dentist || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-forest-700">Notes</p>
                <div className="mt-1">
                  <NotesViewButton
                    notes={selected.notes}
                    title={`${selected.procedure} · ${selected.record_date}`}
                    onOpenChange={setNotesPopup}
                  />
                </div>
              </div>
            </div>

            <ToothChart patientId={user.id} isAdmin={false} />
            <p className="text-xs text-forest-600 text-center mt-2">
              This is your current tooth chart on file with the clinic.
            </p>
          </div>
        )}
      </Modal>

      {/* View-only Notes popup — opened from either the table's Notes button
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