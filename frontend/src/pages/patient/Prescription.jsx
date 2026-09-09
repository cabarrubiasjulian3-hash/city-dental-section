import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

export default function PatientPrescription() {
  const [prescriptions, setPrescriptions] = useState([]);

  useEffect(() => {
    api.get("/prescriptions").then(setPrescriptions).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-bold text-forest-950">Prescription</h2>
      <Card title="Prescriptions">
        {prescriptions.length ? (
          <div className="space-y-3">
            {prescriptions.map((p) => (
              <div key={p.id} className="border border-cream-200 rounded-xl p-4">
                <p className="font-semibold text-forest-950">{p.medicine}</p>
                <p className="text-sm text-forest-700">{p.dosage}</p>
                <p className="text-sm text-forest-700">{p.instructions}</p>
                <p className="text-xs text-forest-700 mt-2">
                  Prescribed by {p.prescribed_by || "—"} on {p.prescribed_at?.slice(0, 10)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">📎</div>
            <EmptyState>No prescriptions on file yet.</EmptyState>
          </div>
        )}
      </Card>
    </div>
  );
}
