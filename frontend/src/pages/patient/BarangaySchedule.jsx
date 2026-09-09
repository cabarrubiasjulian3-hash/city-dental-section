import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default function BarangaySchedule() {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    api.get("/barangay-schedule").then(setSchedules).catch(() => {});
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = schedules.filter((s) => s.visit_date >= today);
  const past = schedules.filter((s) => s.visit_date < today);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">Barangay Appointments</h2>
        <p className="text-sm text-forest-700 mt-1">
          A view-only schedule of which barangay the City Dental Section is visiting, and when — for services like
          tooth extraction, cleaning, and checkups. Just show up on your barangay's date; no booking needed.
        </p>
      </div>

      <Card title="Upcoming barangay dental missions">
        {upcoming.length ? (
          <div className="space-y-4">
            {upcoming.map((s) => (
              <div
                key={s.id}
                className="border border-cream-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
              >
                <div>
                  <p className="font-display font-semibold text-forest-950">{s.barangay_name}</p>
                  <p className="text-sm text-forest-700">
                    {formatDate(s.visit_date)}
                    {s.time_range ? ` · ${s.time_range}` : ""}
                  </p>
                  {s.services && <p className="text-sm text-forest-800 mt-1">{s.services}</p>}
                  {s.location && <p className="text-xs text-forest-700 mt-1">📍 {s.location}</p>}
                  {s.notes && <p className="text-xs text-forest-700 mt-1 italic">{s.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>No upcoming barangay schedules have been posted yet. Check back soon.</EmptyState>
        )}
      </Card>

      {past.length > 0 && (
        <Card title="Past barangay missions">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-700 uppercase text-xs">
                <th className="py-2">Barangay</th>
                <th className="py-2">Date</th>
                <th className="py-2">Services</th>
              </tr>
            </thead>
            <tbody>
              {past.map((s) => (
                <tr key={s.id} className="border-t border-cream-200 text-forest-700">
                  <td className="py-2">{s.barangay_name}</td>
                  <td className="py-2">{s.visit_date}</td>
                  <td className="py-2">{s.services}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
