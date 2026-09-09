import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

export default function PatientDentalRecord() {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    api.get("/dental-records").then(setRecords).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Dental Record</h2>
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
                <tr key={r.id} className="border-t border-cream-200">
                  <td className="py-3">{r.record_date}</td>
                  <td className="py-3">{r.procedure}</td>
                  <td className="py-3">{r.dentist || "—"}</td>
                  <td className="py-3 text-forest-700">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No dental records on file yet. Records appear here after your first visit.</EmptyState>
        )}
      </Card>
    </div>
  );
}
