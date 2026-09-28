import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X as XIcon } from "lucide-react";

// Notes column for a table row. Instead of typing straight into the cell, it
// shows a small button (the notes preview, or the word "Notes" when empty).
// Clicking it opens a popup with a text area to write the notes. The popup
// closes with the X (top right), Cancel, Escape, or by clicking outside it;
// Save (or Ctrl/⌘ + Enter) hands the text to `onSave`.
//
//   <NotesCell value={r.notes} title="Tooth Extraction · 9/21/2026"
//              onSave={(v) => saveRecordField(r, "notes", v)} />
//
// It's rendered through a portal so it always sits on top of whatever popup
// (e.g. Service History) the row lives in.
export default function NotesCell({ value, onSave, title = "", placeholder = "Notes", className = "" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);

  // Keep the draft in sync with the saved value while the popup is closed.
  useEffect(() => {
    if (!open) setDraft(value ?? "");
  }, [value, open]);

  useEffect(() => {
    if (open && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [open]);

  function openPopup() {
    setDraft(value ?? "");
    setError("");
    setOpen(true);
  }

  function closePopup() {
    if (saving) return;
    setOpen(false);
    setError("");
  }

  async function save() {
    if (draft === (value ?? "")) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      setOpen(false);
    } catch (err) {
      setError(err?.message || "Could not save the notes.");
    } finally {
      setSaving(false);
    }
  }

  const hasNotes = !!(value && String(value).trim());

  return (
    <>
      <button
        type="button"
        onClick={openPopup}
        title={hasNotes ? "View / edit notes" : "Add notes"}
        className={`inline-flex max-w-[220px] items-center rounded-full border border-cream-200 bg-cream-50 px-3 py-1 text-left text-sm italic hover:bg-cream-200 focus:outline-none focus:ring-2 focus:ring-forest-500 ${
          hasNotes ? "text-forest-950" : "text-forest-500"
        } ${className}`}
      >
        <span className="truncate">{hasNotes ? value : placeholder}</span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto"
            onClick={(e) => {
              e.stopPropagation();
              closePopup();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Notes"
              className="relative my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") closePopup();
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
              }}
            >
              <button
                type="button"
                onClick={closePopup}
                aria-label="Close notes"
                title="Close"
                className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-900 hover:bg-cream-200 hover:text-forest-800"
              >
                <XIcon size={18} />
              </button>

              <h3 className="font-display text-lg font-bold text-forest-950 pr-8">Notes</h3>
              {title && <p className="mt-0.5 text-sm text-forest-500">{title}</p>}

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                placeholder="Write notes here…"
                className="mt-4 w-full resize-y rounded-lg border border-cream-200 bg-cream-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />

              {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closePopup}
                  disabled={saving}
                  className="rounded-full border border-forest-900 px-4 py-2 text-sm font-semibold text-forest-900 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-full bg-forest-900 px-5 py-2 text-sm font-semibold text-cream-50 hover:bg-forest-800 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save notes"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}