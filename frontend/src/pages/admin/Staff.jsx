import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Pencil, Archive as ArchiveIcon } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";

// Staff Management is ONE page. It has two sections, one after the other:
//   1. Staff Directory — add / edit / archive staff members (dentists, etc.)
//   2. Doctor Access   — generate sign-up access codes for doctors and
//                        confirm (or reject) doctor accounts before they can
//                        log in. (This used to be its own "Doctor Access"
//                        page in the left sidebar.)
// A link to /admin/staff#doctor-access scrolls straight to the second section.

const EMPTY_FORM = { name: "", role: "", email: "", phone: "", schedule: "" };

const formInputClass = "rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm";
const cellInputClass = "w-full rounded-lg border border-forest-500 bg-cream-50 px-2 py-1.5 text-sm";

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

/* ------------------------------------------------------------------ */
/* Section 1 — Staff Directory                                           */
/* ------------------------------------------------------------------ */
function StaffDirectory() {
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
      <div className="flex items-center justify-end">
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
                    <td className="py-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-forest-500">
                        {`ST-${String(s.account_id ?? s.id).padStart(4, "0")}`}
                      </p>
                    </td>
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

/* ------------------------------------------------------------------ */
/* Section 2 — Doctor Access                                             */
/* ------------------------------------------------------------------ */
function DoctorAccessPanel({ doctors, codes, reload }) {
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [error, setError] = useState("");

  async function generateCode() {
    setGenerating(true);
    setError("");
    try {
      const code = await api.post("/doctor-access/codes", {});
      setNewCode(code.code);
      reload();
    } catch (err) {
      setError(err.message || "Could not generate a code.");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteCode(id) {
    if (!window.confirm("Move this access code to the Archive?\n\nYou can restore it from the Archive page.")) return;
    setError("");
    try {
      await api.del(`/doctor-access/codes/${id}`);
      reload();
    } catch (err) {
      setError(err.message || "Could not remove that code.");
    }
  }

  async function approveDoctor(id) {
    setError("");
    try {
      await api.post(`/doctor-access/doctors/${id}/approve`, {});
      reload();
    } catch (err) {
      setError(err.message || "Could not confirm that doctor.");
    }
  }

  async function rejectDoctor(id) {
    if (!window.confirm("Reject this doctor account? They will not be able to log in.")) return;
    setError("");
    try {
      await api.post(`/doctor-access/doctors/${id}/reject`, {});
      reload();
    } catch (err) {
      setError(err.message || "Could not reject that doctor.");
    }
  }

  const pendingDoctors = doctors.filter((d) => d.doctor_status === "pending");
  const reviewedDoctors = doctors.filter((d) => d.doctor_status !== "pending");

  return (
    <div className="space-y-6">
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
                  <td className="py-3">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-forest-500">ST-{String(d.id).padStart(4, "0")}</p>
                  </td>
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
                      <button
                        type="button"
                        title="Archive access code"
                        aria-label="Archive access code"
                        onClick={() => deleteCode(c.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-700 hover:bg-red-50"
                      >
                        <ArchiveIcon size={16} />
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
                  <td className="py-3">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-forest-500">ST-{String(d.id).padStart(4, "0")}</p>
                  </td>
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

/* ------------------------------------------------------------------ */
/* The merged page                                                     */
/* ------------------------------------------------------------------ */
export default function AdminStaff() {
  const { hash } = useLocation();

  const [codes, setCodes] = useState([]);
  const [doctors, setDoctors] = useState([]);

  function loadDoctorAccess() {
    api.get("/doctor-access/codes").then(setCodes).catch(() => {});
    api.get("/doctor-access/doctors").then(setDoctors).catch(() => {});
  }
  useEffect(loadDoctorAccess, []);

  // /admin/staff#doctor-access (from the old Doctor Access link) scrolls to that section.
  useEffect(() => {
    if (hash === "#doctor-access") {
      document.getElementById("doctor-access")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hash]);

  const pendingCount = doctors.filter((d) => d.doctor_status === "pending").length;

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest-950">Staff Management</h2>
          <p className="text-sm text-forest-700 mt-1">
            Manage the clinic's staff directory, and control which doctors can sign up and log in.
          </p>
        </div>
        <StaffDirectory />
      </section>

      <section id="doctor-access" className="space-y-6 border-t border-cream-200 pt-8 scroll-mt-4">
        <div>
          <h3 className="font-display text-xl font-bold text-forest-950 flex items-center gap-2">
            Doctor Access
            {pendingCount > 0 && (
              <span
                title={`${pendingCount} doctor account${pendingCount === 1 ? "" : "s"} waiting for confirmation`}
                className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-clay-500 px-1.5 text-xs font-bold text-white"
              >
                {pendingCount}
              </span>
            )}
          </h3>
          <p className="text-sm text-forest-700 mt-1">
            Generate sign-up access codes for doctors, and confirm accounts before they can log in.
          </p>
        </div>
        <DoctorAccessPanel doctors={doctors} codes={codes} reload={loadDoctorAccess} />
      </section>
    </div>
  );
}