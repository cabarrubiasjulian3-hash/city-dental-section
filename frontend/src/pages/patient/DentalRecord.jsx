import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, EmptyState } from "../../components/ui";
import Modal from "../../components/Modal";
import ToothChart from "../../components/ToothChart";

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
                  <td className="py-3 text-forest-700">{r.notes || "—"}</td>
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

            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm mb-6">
              <dt className="text-forest-700 font-medium">Date</dt>
              <dd className="text-forest-950">{selected.record_date}</dd>
              <dt className="text-forest-700 font-medium">Procedure</dt>
              <dd className="text-forest-950">{selected.procedure}</dd>
              <dt className="text-forest-700 font-medium">Dentist</dt>
              <dd className="text-forest-950">{selected.dentist || "—"}</dd>
              <dt className="text-forest-700 font-medium">Notes</dt>
              <dd className="text-forest-950 whitespace-pre-line">{selected.notes || "—"}</dd>
            </dl>

            <ToothChart patientId={user.id} isAdmin={false} />
            <p className="text-xs text-forest-600 text-center mt-2">
              This is your current tooth chart on file with the clinic.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}