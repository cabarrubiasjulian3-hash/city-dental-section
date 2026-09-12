import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

export default function AdminStaff({ readOnly = false }) {
  const [staff, setStaff] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", email: "", phone: "", schedule: "" });

  function load() {
    api.get("/staff").then(setStaff).catch(() => {});
  }
  useEffect(load, []);

  async function addStaff(e) {
    e.preventDefault();
    await api.post("/staff", form);
    setForm({ name: "", role: "", email: "", phone: "", schedule: "" });
    setShowForm(false);
    load();
  }

  async function removeStaff(id) {
    await api.del(`/staff/${id}`);
    load();
  }

  return (
    <fieldset disabled={readOnly} style={{ display: "contents" }}>
    <div className="space-y-6">
      {readOnly && (
        <div className="bg-clay-500/10 border border-clay-500 text-forest-900 text-sm rounded-lg px-3 py-2">
          Preview only — doctor accounts can view the staff directory but cannot make changes.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-forest-950">Staff Management</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-5 py-2 hover:bg-brand-800"
        >
          {showForm ? "Close" : "+ Add staff"}
        </button>
      </div>

      {showForm && (
        <Card title="Add staff member">
          <form onSubmit={addStaff} className="grid sm:grid-cols-2 gap-4">
            <input placeholder="Full name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm" />
            <input placeholder="Role (e.g. Dentist)" required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm" />
            <input placeholder="Schedule (e.g. Mon-Fri, 8AM-5PM)" value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} className="sm:col-span-2 rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm" />
            <button className="sm:col-span-2 bg-brand-900 text-brand-50 text-sm font-semibold rounded-full py-2.5 hover:bg-brand-800">
              Add staff member
            </button>
          </form>
        </Card>
      )}

      <Card title={`Staff directory (${staff.length})`}>
        {staff.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forest-700 uppercase text-xs">
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Contact</th>
                <th className="py-2">Schedule</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-cream-200">
                  <td className="py-3 font-medium">{s.name}</td>
                  <td className="py-3">{s.role}</td>
                  <td className="py-3 text-forest-700">{s.email || s.phone || "—"}</td>
                  <td className="py-3 text-forest-700">{s.schedule || "—"}</td>
                  <td className="py-3 text-right">
                    <button onClick={() => removeStaff(s.id)} className="text-xs underline text-red-700">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>No staff members added yet.</EmptyState>
        )}
      </Card>
    </div>
    </fieldset>
  );
}