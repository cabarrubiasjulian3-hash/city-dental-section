import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, EmptyState, StatCard } from "../../components/ui";

export default function PatientDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [records, setRecords] = useState([]);
  const [welcome, setWelcome] = useState(location.state?.welcome || null);

  useEffect(() => {
    api.get(`/patients/${user.id}`).then(setProfile).catch(() => {});
    api.get("/barangay-schedule").then(setSchedules).catch(() => {});
    api.get("/dental-records").then(setRecords).catch(() => {});
  }, [user.id]);

  const today = new Date().toISOString().slice(0, 10);
  const nextSchedule = schedules.find((s) => s.visit_date >= today);

  const totalVisits = records.length;
  const extractionCount = records.filter((r) => /extract|bunot|hilas/i.test(r.procedure || "")).length;
  const lastVisit = records[0]?.record_date || null; // records come back sorted DESC by date

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">Dashboard</h2>
        <p className="text-sm text-forest-700 mt-1">
          An overview of your dental profile and records. Head to{" "}
          <Link to="/patient/profile" className="underline font-medium">My Profile</Link> to edit your personal
          information. For your barangay's next dental mission date, see below.
        </p>
      </div>

      {welcome && (
        <div
          className={`rounded-2xl border px-5 py-3 text-sm flex items-start justify-between gap-4 ${
            welcome.matched
              ? "bg-green-50 border-green-200 text-green-900"
              : "bg-cream-100 border-cream-200 text-forest-800"
          }`}
        >
          <p>{welcome.message}</p>
          <button onClick={() => setWelcome(null)} className="text-xs underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {totalVisits > 0 ? (
        <div className="grid sm:grid-cols-3 gap-4">
          <StatCard label="Total Recorded Visits" value={totalVisits} />
          <StatCard label="Tooth Extractions" value={extractionCount} />
          <StatCard label="Last Visit" value={lastVisit || "—"} />
        </div>
      ) : (
        <div className="rounded-2xl border border-cream-200 bg-cream-100 px-5 py-4 text-sm text-forest-700">
          You don't have any dental records on file yet, so you're not showing as a returning patient in our system
          yet. Once the clinic logs a visit for you (during a barangay mission or at the office), it will appear
          here automatically.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Patient Record Summary" action={<Link to="/patient/profile" className="text-xs underline">Edit</Link>}>
          {profile ? (
            <div className="flex gap-4">
              <div className="w-16 h-16 rounded-xl bg-cream-200 flex items-center justify-center text-3xl">🙂</div>
              <div>
                <p className="font-display font-semibold text-forest-950">{profile.name}</p>
                <p className="text-sm text-forest-700">{profile.birthdate || "No birthdate on file"}</p>
                <p className="text-sm text-forest-700">{profile.sex || "—"}</p>
                <p className="text-sm text-forest-700">{profile.address || "No address on file"}</p>
                <p className="text-sm text-forest-700">{profile.occupation || ""}</p>
              </div>
            </div>
          ) : (
            <EmptyState>Loading…</EmptyState>
          )}
        </Card>

        <Card title="Vitals">
          {profile?.vitals ? (
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between"><span className="text-forest-700">Pulse Rate</span><span className="font-semibold">{profile.vitals.pulse_rate} bpm</span></li>
              <li className="flex justify-between"><span className="text-forest-700">Blood Pressure</span><span className="font-semibold">{profile.vitals.blood_pressure}</span></li>
              <li className="flex justify-between"><span className="text-forest-700">Temperature</span><span className="font-semibold">{profile.vitals.temperature} °C</span></li>
            </ul>
          ) : (
            <EmptyState>No vitals recorded yet.</EmptyState>
          )}
        </Card>

        <Card title="Next Barangay Dental Mission" action={<Link to="/patient/barangay-appointments" className="text-xs underline">See more</Link>}>
          {nextSchedule ? (
            <div>
              <p className="font-display font-semibold text-lg text-forest-950">{nextSchedule.barangay_name}</p>
              <p className="text-sm text-forest-700 mt-1">
                {nextSchedule.visit_date}{nextSchedule.time_range ? ` · ${nextSchedule.time_range}` : ""}
              </p>
              {nextSchedule.services && <p className="text-sm text-forest-800 mt-2">{nextSchedule.services}</p>}
            </div>
          ) : (
            <EmptyState>No upcoming barangay schedules posted yet.</EmptyState>
          )}
        </Card>

        <Card title="Dental Records" action={<Link to="/patient/dental-record" className="text-xs underline">See more</Link>}>
          {records.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-forest-700 uppercase text-xs">
                  <th className="py-1">Procedure</th>
                  <th className="py-1">Date</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 3).map((r) => (
                  <tr key={r.id} className="border-t border-cream-200">
                    <td className="py-2">{r.procedure}</td>
                    <td className="py-2">{r.record_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState>No dental records on file yet.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
