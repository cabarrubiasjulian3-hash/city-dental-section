import { useEffect, useRef, useState } from "react";

// Spreadsheet-style editable text/date/select cell. Click to edit, Enter or
// blur to save, Escape to cancel. Renders a plain <input>/<select> so it
// behaves the way a spreadsheet cell would.
export default function EditableCell({ value, type = "text", options, placeholder, onSave, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft === (value ?? "")) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const display =
      type === "select" ? options?.find((o) => o.value === value)?.label ?? value : value;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit"
        className={`w-full text-left px-2 py-1.5 rounded hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-forest-500 min-h-[2rem] ${
          saving ? "opacity-50" : ""
        } ${className}`}
      >
        {display || <span className="text-forest-400 italic">{placeholder || "—"}</span>}
      </button>
    );
  }

  if (type === "select") {
    return (
      <select
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full px-2 py-1.5 rounded border border-forest-500 bg-cream-50 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full px-2 py-1.5 rounded border border-forest-500 bg-cream-50 text-sm"
    />
  );
}

export const SEX_OPTIONS = [
  { value: "", label: "—" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];