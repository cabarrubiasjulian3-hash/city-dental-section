import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../../components/ui";
import ConfirmDialog from "../../components/ConfirmDialog";

// Everything that gets "deleted" or "removed" anywhere in the portals lands
// here instead of being destroyed. Admin can look through it and restore
// anything that was removed by mistake (see backend/lib/archive.js).

const TABS = [
  { key: "all", label: "All" },
  { key: "patient", label: "Patients" },
  { key: "doctor", label: "Doctors" },
  { key: "service_record", label: "Service records" },
  { key: "barangay_schedule", label: "Barangay schedule" },
  { key: "rotation", label: "Weekly rotations" },
  { key: "staff", label: "Staff" },
  { key: "access_code", label: "Access codes" },
];

const TYPE_LABEL = {
  patient: "Patient",
  doctor: "Doctor",
  service_record: "Service record",
  barangay_schedule: "Barangay schedule",
  rotation: "Weekly rotation",
  staff: "Staff",
  access_code: "Access code",
};

// SQLite's datetime('now') is UTC without a "Z" — add it so the browser
// shows the viewer's local time.
function formatWhen(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminArchive() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [restoringId, setRestoringId] = useState(null);
  // The item the admin is being asked to confirm restoring (or null).
  const [confirmItem, setConfirmItem] = useState(null);
  const [message, setMessage] = useState(null); // { type: "success" | "error", text }

  useEffect(() => {
    api
      .get("/archive")
      .then(setItems)
      .catch((err) => setMessage({ type: "error", text: err.message || "Could not load the archive." }))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: items.length };
    for (const item of items) c[item.entity_type] = (c[item.entity_type] || 0) + 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== "all" && item.entity_type !== tab) return false;
      if (!q) return true;
      return [item.label, item.detail, item.archived_by_name].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [items, tab, search]);

  async function restore(item) {
    setMessage(null);
    setRestoringId(item.id);
    try {
      await api.post(`/archive/${item.id}/restore`, {});
      setItems((list) => list.filter((i) => i.id !== item.id));
      setMessage({ type: "success", text: `"${item.label}" was restored.` });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Could not restore that item." });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-forest-950">Archive</h2>
        <p className="text-sm text-forest-700 mt-1">
          Anything deleted or removed in the portals is kept here. Restore an item to put it back exactly where it was.
        </p>
      </div>

      {message && (
        <div
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
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-xs font-semibold rounded-full px-3.5 py-1.5 transition-colors ${
                  tab === t.key
                    ? "bg-brand-900 text-brand-50"
                    : "bg-cream-100 border border-cream-200 text-forest-900 hover:bg-cream-200"
                }`}
              >
                {t.label} ({counts[t.key] || 0})
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the archive…"
            className="rounded-full border border-cream-200 bg-cream-100 px-4 py-2 text-sm outline-none focus:border-forest-700 w-full sm:w-64"
          />
        </div>

        {loading ? (
          <EmptyState>Loading…</EmptyState>
        ) : visible.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-forest-700 uppercase text-xs">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Archived by</th>
                  <th className="py-2 pr-3">Archived on</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-t border-cream-200 align-top">
                    <td className="py-3 pr-3">
                      <p className="font-medium text-forest-950">{item.label}</p>
                      {item.detail && <p className="text-xs text-forest-600 mt-0.5">{item.detail}</p>}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center rounded-full bg-cream-200 text-forest-800 px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                        {TYPE_LABEL[item.entity_type] || item.entity_type}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-forest-700">
                      {item.archived_by_name || "—"}
                      {item.archived_by_role && <p className="text-xs text-forest-500 capitalize">{item.archived_by_role}</p>}
                    </td>
                    <td className="py-3 pr-3 text-forest-700 whitespace-nowrap">{formatWhen(item.archived_at)}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setConfirmItem(item)}
                        disabled={restoringId === item.id}
                        className="bg-brand-900 text-brand-50 text-xs font-semibold rounded-full px-4 py-1.5 hover:bg-brand-800 disabled:opacity-60"
                      >
                        {restoringId === item.id ? "Restoring…" : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            {items.length ? "Nothing in the archive matches that." : "The archive is empty. Anything you delete will show up here."}
          </EmptyState>
        )}
      </Card>

      {/* "Are you sure?" pop-up before anything is restored. */}
      <ConfirmDialog
        isOpen={!!confirmItem}
        title="Restore this item?"
        message={
          confirmItem &&
          `"${confirmItem.label}" (${TYPE_LABEL[confirmItem.entity_type] || confirmItem.entity_type}) will be put back exactly where it was.`
        }
        confirmLabel="Restore"
        busy={restoringId !== null}
        onConfirm={async () => {
          const item = confirmItem;
          await restore(item);
          setConfirmItem(null);
        }}
        onCancel={() => restoringId === null && setConfirmItem(null)}
      />
    </div>
  );
}