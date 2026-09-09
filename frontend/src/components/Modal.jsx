export default function Modal({ isOpen, onClose, children, wide = false }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full p-8 my-auto ${wide ? "max-w-2xl" : "max-w-md"}`}
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