import { useEffect, useState } from "react";
import { Pencil, Archive as ArchiveIcon } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

const EMPTY_FORM = { name: "", role: "", email: "", phone: "", schedule: "" };

const formInputClass = "rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm";
const cellInputClass = "w-full rounded-lg border border-forest-500 bg-cream-50 px-2 py-1.5 text-sm";

// Staff Management now lives in the Doctor Portal only (see App.jsx). A
// doctor can add, edit and remove staff. "Remove" moves the person to the
// Archive, where an admin can restore them.
export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.get("/staff").then(setStaff).catch(() => {});
  }
  useEffect(load, []);

  async function addStaff(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/staff", form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message || "Could not add that staff member.");
    }
  }

  function startEdit(s) {
    setError("");
    setEditingId(s.id);
    setEditForm({
      name: s.name || "",
      role: s.role || "",
      email: s.email || "",
      phone: s.phone || "",
      schedule: s.schedule || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setError("");
  }

  async function saveEdit(id) {
    if (!editForm.name.trim() || !editForm.role.trim()) {
      setError("Name and role are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await api.patch(`/staff/${id}`, editForm);
      setStaff((list) => list.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
    } catch (err) {
      setError(err.message || "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  async function removeStaff(s) {
    if (
      !window.confirm(
        `Move ${s.name} to the Archive?\n\nThey'll be taken off the staff directory. An admin can restore them from the Archive page.`
      )
    )
      return;
    setError("");
    try {
      await api.del(`/staff/${s.id}`);
      setStaff((list) => list.filter((x) => x.id !== s.id));
      if (editingId === s.id) setEditingId(null);
    } catch (err) {
      setError(err.message || "Could not remove that staff member.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-forest-950">Staff Management</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-brand-900 text-brand-50 text-sm font-semibold rounded-full px-5 py-2 hover:bg-brand-800"
        >
          {showForm ? "Close" : "+ Add staff"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <Card title="Add staff member">
          <form onSubmit={addStaff} className="grid sm:grid-cols-2 gap-4">
            <input placeholder="Full name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={formInputClass} />
            <input placeholder="Role (e.g. Dentist)" required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={formInputClass} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={formInputClass} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={formInputClass} />
            <input placeholder="Schedule (e.g. Mon-Fri, 8AM-5PM)" value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} className={`sm:col-span-2 ${formInputClass}`} />
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
              {staff.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id} className="border-t border-cream-200 align-top bg-cream-100">
                    <td className="py-3 pr-2">
                      <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={cellInputClass} placeholder="Full name" />
                    </td>
                    <td className="py-3 pr-2">
                      <input value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} className={cellInputClass} placeholder="Role" />
                    </td>
                    <td className="py-3 pr-2 space-y-1.5">
                      <input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className={cellInputClass} placeholder="Email" />
                      <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className={cellInputClass} placeholder="Phone" />
                    </td>
                    <td className="py-3 pr-2">
                      <input value={editForm.schedule} onChange={(e) => setEditForm((f) => ({ ...f, schedule: e.target.value }))} className={cellInputClass} placeholder="Schedule" />
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => saveEdit(s.id)}
                        disabled={saving}
                        className="bg-brand-900 text-brand-50 text-xs font-semibold rounded-full px-3 py-1.5 hover:bg-brand-800 disabled:opacity-60 mr-2"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={cancelEdit} className="text-xs underline text-forest-800">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-t border-cream-200">
                    <td className="py-3 font-medium">{s.name}</td>
                    <td className="py-3">{s.role}</td>
                    <td className="py-3 text-forest-700">
                      {s.email || s.phone ? (
                        <>
                          {s.email && <p>{s.email}</p>}
                          {s.phone && <p>{s.phone}</p>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-forest-700">{s.schedule || "—"}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="Edit staff member"
                          aria-label={`Edit ${s.name}`}
                          onClick={() => startEdit(s)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-forest-800 hover:bg-cream-200"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          title="Archive staff member"
                          aria-label={`Archive ${s.name}`}
                          onClick={() => removeStaff(s)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-700 hover:bg-red-50"
                        >
                          <ArchiveIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        ) : (
          <EmptyState>No staff members added yet.</EmptyState>
        )}
      </Card>
    </div>
  );
}