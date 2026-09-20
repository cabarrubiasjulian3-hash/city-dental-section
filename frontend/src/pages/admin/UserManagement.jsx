import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Card, EmptyState } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";

// Admin → User Management. Every account in the system in one place, with
// filters so it's clear who is who:
//   - Doctors & Staff        doctor and admin accounts
//   - Patients               patient accounts that already have service records
//   - No records yet         "incoming" patients: they made an account but
//                            nothing has been recorded for them yet
// The admin can delete an account that shouldn't be there (e.g. an
// unauthorized sign-up). Two safety rules, enforced by the server as well:
// admin accounts and your own account can't be deleted, and a patient who
// already has records is archived from Patient Management instead (deleting
// them here would destroy their records).

const PAGE_SIZE = 100;

const GROUPS = [
  { key: "all", label: "All" },
  { key: "staff", label: "Doctors & Staff" },
  { key: "patients", label: "Patients" },
  { key: "incoming", label: "No records yet" },
];

const ROLE_STYLES = {
  admin: "bg-forest-900 text-cream-50",
  doctor: "bg-leaf-300 text-forest-900",
  patient: "bg-cream-200 text-forest-800",
};

const STATUS_STYLES = {
  approved: "bg-leaf-300 text-forest-900",
  pending: "bg-clay-500 text-white",
  rejected: "bg-red-100 text-red-700",
};

function groupOf(u) {
  if (u.role === "doctor" || u.role === "admin") return "staff";
  return u.record_count > 0 ? "patients" : "incoming";
}

// SQLite's datetime('now') is UTC without a "Z" — add it so the browser
// shows the viewer's local time.
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString([], { dateStyle: "medium" });
}

// Why the delete button is unavailable for a row (or null if it's allowed).
function deleteBlockedReason(u, currentUserId) {
  if (u.id === currentUserId) return "You can't delete your own account.";
  if (u.role === "admin") return "Admin accounts can't be deleted here.";
  if (u.role === "patient" && u.record_count > 0) {
    return "This patient has service records — archive them from Patient Management instead.";
  }
  return null;
}

export default function AdminUserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [message, setMessage] = useState(null); // { type: "success" | "error", text }
  const [confirmUser, setConfirmUser] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get("/users")
      .then(setUsers)
      .catch((err) => setMessage({ type: "error", text: err.message || "Could not load the users." }))
      .finally(() => setLoading(false));
  }, []);

  // Start from the first page again whenever the filter/search changes.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [group, search]);

  const counts = useMemo(() => {
    const c = { all: users.length, staff: 0, patients: 0, incoming: 0 };
    for (const u of users) c[groupOf(u)] += 1;
    return c;
  }, [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (group !== "all" && groupOf(u) !== group) return false;
      if (!q) return true;
      return [u.name, u.email, u.barangay, u.role].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [users, group, search]);

  async function deleteUser(target) {
    setMessage(null);
    setDeleting(true);
    try {
      await api.del(`/users/${target.id}`);
      setUsers((list) => list.filter((u) => u.id !== target.id));
      setMessage({ type: "success", text: `${target.name}'s account was deleted.` });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Could not delete that account." });
    } finally {
      setDeleting(false);
      setConfirmUser(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">User Management</h2>
        <p className="text-sm text-forest-700 mt-1">
          See who has an account — doctors and staff, patients, and patients who signed up but have no records yet —
          and delete accounts that shouldn't be here. Approve or reject doctor sign-ups in{" "}
          <Link to="/admin/doctor-access" className="underline font-semibold">
            Doctor Access
          </Link>
          .
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`text-sm rounded-lg px-3 py-2 border ${
            message.type === "success"
              ? "bg-leaf-300/40 border-leaf-300 text-forest-900"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroup(g.key)}
                aria-pressed={group === g.key}
                className={`text-xs font-semibold rounded-full px-3.5 py-1.5 transition-colors ${
                  group === g.key
                    ? "bg-brand-900 text-brand-50"
                    : "bg-cream-100 border border-cream-200 text-forest-900 hover:bg-cream-200"
                }`}
              >
                {g.label} ({counts[g.key] || 0})
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or barangay…"
            className="rounded-full border border-cream-200 bg-cream-100 px-4 py-2 text-sm outline-none focus:border-forest-700 w-full sm:w-72"
          />
        </div>

        {loading ? (
          <EmptyState>Loading…</EmptyState>
        ) : visible.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-forest-700 uppercase text-xs">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Registered</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, limit).map((u) => {
                    const blocked = deleteBlockedReason(u, me?.id);
                    return (
                      <tr key={u.id} className="border-t border-cream-200 align-top">
                        <td className="py-3 pr-3">
                          <p className="font-medium text-forest-950">{u.name}</p>
                          {u.barangay && <p className="text-xs text-forest-600 mt-0.5">Brgy. {u.barangay}</p>}
                        </td>
                        <td className="py-3 pr-3 text-forest-700 break-all">{u.email}</td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize whitespace-nowrap ${
                              ROLE_STYLES[u.role] || ROLE_STYLES.patient
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          {u.role === "doctor" ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize whitespace-nowrap ${
                                STATUS_STYLES[u.doctor_status] || "bg-cream-200 text-forest-700"
                              }`}
                            >
                              {u.doctor_status || "—"}
                            </span>
                          ) : u.role === "patient" ? (
                            u.record_count > 0 ? (
                              <span className="text-forest-700">
                                {u.record_count} record{u.record_count === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-clay-500/15 text-clay-700 px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                                No records yet
                              </span>
                            )
                          ) : (
                            <span className="text-forest-500">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-forest-700 whitespace-nowrap">{formatDate(u.created_at)}</td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!!blocked}
                            title={blocked || "Delete this account"}
                            aria-label={blocked ? `Can't delete ${u.name}` : `Delete ${u.name}`}
                            onClick={() => setConfirmUser(u)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-700 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-xs text-forest-600">
              <span>
                Showing {Math.min(limit, visible.length)} of {visible.length}
              </span>
              {visible.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  className="rounded-full border border-forest-900 px-4 py-1.5 font-semibold text-forest-900 hover:bg-cream-100"
                >
                  Show more
                </button>
              )}
            </div>
          </>
        ) : (
          <EmptyState>{users.length ? "No accounts match that." : "No accounts yet."}</EmptyState>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!confirmUser}
        title="Delete this account?"
        message={
          confirmUser &&
          `${confirmUser.name} (${confirmUser.email}) will be permanently deleted${
            confirmUser.role === "doctor" ? " and won't be able to log in anymore" : ""
          }.\n\nThis can't be undone.`
        }
        confirmLabel="Delete account"
        tone="danger"
        busy={deleting}
        onConfirm={() => deleteUser(confirmUser)}
        onCancel={() => !deleting && setConfirmUser(null)}
      />
    </div>
  );
}