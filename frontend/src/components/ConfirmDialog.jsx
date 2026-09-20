import { useEffect, useRef } from "react";

// A small "are you sure?" pop-up used before anything is archived, deleted or
// restored (and for the "this patient already has a record" question).
//
//   <ConfirmDialog
//     isOpen={!!confirm}
//     title="Archive this patient record?"
//     message="Juan will be moved to the Archive."
//     confirmLabel="Archive"
//     tone="danger"                 // red confirm button; default is green
//     busy={saving}                 // disables the buttons while working
//     onConfirm={...}
//     onCancel={...}
//     // optional third choice (used by the duplicate-patient pop-up):
//     secondaryLabel="Continue new record"
//     onSecondary={...}
//   />
//
// It sits ABOVE the other pop-ups (z-index 70 vs. 50), so it can be opened
// from inside Service History, the New Patient form, etc. Press Esc or click
// the dark area to cancel. The Cancel button is focused first so an
// accidental Enter never confirms a delete.
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  secondaryLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onSecondary,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    cancelRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") onCancel?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const confirmStyle =
    tone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-brand-900 text-brand-50 hover:bg-brand-800";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold text-forest-950">{title}</h3>
        {message && <div className="mt-2 text-sm leading-relaxed text-forest-800 whitespace-pre-line">{message}</div>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-forest-900 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-cream-100 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          {secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary}
              disabled={busy}
              className="rounded-full border border-forest-900 bg-cream-100 px-4 py-2 text-sm font-semibold text-forest-900 hover:bg-cream-200 disabled:opacity-60"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60 ${confirmStyle}`}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}