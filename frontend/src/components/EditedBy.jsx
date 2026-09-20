// "Edited by Dr. Ana Lopez · Sep 20, 10:30 AM" — who last added or changed a
// record, and when. The server stamps last_edited_by / last_edited_role /
// last_edited_at on patients, service records, barangay schedule entries and
// weekly rotations (see backend/lib/editStamp.js). Shows nothing for records
// nobody has edited since this was added.
//
//   <EditedBy row={record} />                 one line: "Edited by … · …"
//   <EditedBy row={record} stacked />         two lines: name, then time

// SQLite's datetime('now') is UTC without a "Z" — add it so the browser shows
// the viewer's local time.
function formatWhen(value) {
  if (!value) return "";
  const d = new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function editorLabel(name, role) {
  const clean = String(name || "").trim();
  if (!clean) return "";
  if (role === "doctor") return `Dr. ${clean.replace(/^(dr\.?|doctor)\s+/i, "")}`;
  if (role === "admin" && !/admin/i.test(clean)) return `${clean} (Admin)`;
  return clean;
}

export default function EditedBy({ row, stacked = false, className = "" }) {
  const who = editorLabel(row?.last_edited_by, row?.last_edited_role);
  if (!who) return null;
  const when = formatWhen(row.last_edited_at);
  if (stacked) {
    return (
      <span className={`block text-xs text-forest-700 ${className}`}>
        <span className="block font-medium">{who}</span>
        {when && <span className="block text-forest-500">{when}</span>}
      </span>
    );
  }
  return (
    <span className={`block text-[11px] text-forest-500 ${className}`}>
      Edited by {who}
      {when ? ` · ${when}` : ""}
    </span>
  );
}