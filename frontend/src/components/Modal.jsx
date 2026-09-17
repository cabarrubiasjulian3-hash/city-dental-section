export default function Modal({ isOpen, onClose, children, wide = false, size }) {
  if (!isOpen) return null;

  // size="xl" is for large forms (e.g. the Individual Patient Treatment
  // Record). wide (legacy) is kept as an alias for size="lg" so existing
  // callers don't need to change.
  const resolvedSize = size || (wide ? "lg" : "md");
  const widthClass =
    resolvedSize === "2xl"
      ? "max-w-[92vw]"
      : resolvedSize === "xl"
      ? "max-w-5xl"
      : resolvedSize === "lg"
      ? "max-w-2xl"
      : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full p-8 my-auto ${widthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-5 text-ink-900 text-xl font-bold hover:text-forest-800 transition-colors"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}