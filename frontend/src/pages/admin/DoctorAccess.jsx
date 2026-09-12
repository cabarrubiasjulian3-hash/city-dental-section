import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

const STATUS_STYLES = {
  unused: "bg-cream-200 text-forest-800",
  used: "bg-leaf-300 text-forest-900",
  revoked: "bg-red-100 text-red-700",
  pending: "bg-clay-500 text-white",
  approved: "bg-leaf-300 text-forest-900",
  rejected: "bg-red-100 text-red-700",
};

function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap capitalize ${
        STATUS_STYLES[status] ?? "bg-cream-200 text-forest-700"
      }`}
    >
      {status}
    </span>
  );
}

export default function AdminDoctorAccess() {
  const [codes, setCodes] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api.get("/doctor-access/codes").then(setCodes).catch(() => {});
    api.get("/doctor-access/doctors").then(setDoctors).catch(() => {});
  }
  useEffect(load, []);

  async function generateCode() {
    setGenerating(true);
    setError("");
    try {
      const code = await api.post("/doctor-access/codes", {});
      setNewCode(code.code);
      load();
    } catch (err) {
      setError(err.message || "Could not generate a code.");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteCode(id) {
    if (!window.confirm("Delete this access code? This can't be undone.")) return;
    await api.del(`/doctor-access/codes/${id}`);
    // Remove it from the list right away instead of waiting on a reload —
    // it's gone from the database, so it shouldn't still show on screen.
    setCodes((prev) => prev.filter((c) => c.id !== id));
  }

  async function approveDoctor(id) {
    await api.post(`/doctor-access/doctors/${id}/approve`, {});
    load();
  }

  async function rejectDoctor(id) {
    if (!window.confirm("Reject this doctor account? They will not be able to log in.")) return;
    await api.post(`/doctor-access/doctors/${id}/reject`, {});
    load();
  }

  const pendingDoctors = doctors.filter((d) => d.doctor_status === "pending");
  const reviewedDoctors = doctors.filter((d) => d.doctor_status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">Doctor Access</h2>
        <p className="text-sm text-forest-700 mt-1">
          Generate sign-up access codes for doctors, and confirm accounts before they can log in.
        </p>
      </div>

      <Card
        title="Pending doctor confirmations"
        subtitle="Signed up with a valid access code, but still need your OK before they can log in."
      >
        {pendingDoctors.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-700 uppercase text-xs">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Access code used</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pendingDoctors.map((d) => (
                <tr key={d.id} className="border-t border-cream-200">
                  <td className="py-3 font-medium">{d.name}</td>
                  <td className="py-3 text-forest-700">{d.email}</td>
                  <td className="py-3 text-forest-700 font-mono text-xs">{d.doctor_access_code}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => approveDoctor(d.id)}
                      className="bg-forest-900 text-cream-50 text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-forest-800 mr-2"
                    >
                      Confirm as doctor
                    </button>
                    <button onClick={() => rejectDoctor(d.id)} className="text-xs underline text-red-700">
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No doctor accounts waiting for confirmation.</EmptyState>
        )}
      </Card>

      <Card
        title="Access codes"
        action={
          <button
            onClick={generateCode}
            disabled={generating}
            className="bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-4 py-2 hover:bg-brand-800 disabled:opacity-60"
          >
            {generating ? "Generating…" : "+ Generate code"}
          </button>
        }
      >
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        {newCode && (
          <div className="bg-leaf-300/40 border border-leaf-300 text-forest-900 text-sm rounded-lg px-3 py-2 mb-3">
            New code: <span className="font-mono font-bold">{newCode}</span> — give this to the doctor to use on the
            Sign Up page. It's usable once.
          </div>
        )}
        {codes.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-700 uppercase text-xs">
                <th className="py-2">Code</th>
                <th className="py-2">Status</th>
                <th className="py-2">Used by</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-cream-200">
                  <td className="py-3 font-mono">{c.code}</td>
                  <td className="py-3">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="py-3 text-forest-700">
                    {c.used_by_name ? `${c.used_by_name} (${c.used_by_status})` : "—"}
                  </td>
                  <td className="py-3 text-right">
                    {c.status !== "used" && (
                      <button onClick={() => deleteCode(c.id)} className="text-xs underline text-red-700">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No access codes generated yet.</EmptyState>
        )}
      </Card>

      <Card title={`All doctor accounts (${reviewedDoctors.length})`}>
        {reviewedDoctors.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-700 uppercase text-xs">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Status</th>
                <th className="py-2">Reviewed by</th>
              </tr>
            </thead>
            <tbody>
              {reviewedDoctors.map((d) => (
                <tr key={d.id} className="border-t border-cream-200">
                  <td className="py-3 font-medium">{d.name}</td>
                  <td className="py-3 text-forest-700">{d.email}</td>
                  <td className="py-3">
                    <StatusPill status={d.doctor_status} />
                  </td>
                  <td className="py-3 text-forest-700">{d.approved_by_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No reviewed doctor accounts yet.</EmptyState>
        )}
      </Card>
    </div>
  );
}