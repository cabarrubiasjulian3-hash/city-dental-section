// Shared, small presentational building blocks used across the admin and
// patient portals: a bordered panel with an optional header (Card), a
// compact metric tile (StatCard), a status pill (Badge), and a "nothing
// here yet" placeholder (EmptyState). Kept intentionally dumb — no data
// fetching, just layout + theme tokens — so any page can drop them in.

export function Card({ title, subtitle, action, className = "", children }) {
  return (
    <div className={`bg-cream-50 border border-cream-200 rounded-2xl p-5 ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h3 className="font-display text-base font-bold text-forest-950">{title}</h3>}
            {subtitle && <p className="text-xs text-forest-600 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ label, value, subtitle, icon }) {
  return (
    <div className="bg-cream-50 border border-cream-200 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-600">{label}</p>
        {icon && (
          <span className="w-8 h-8 rounded-full bg-cream-200 text-forest-900 flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-display font-extrabold text-forest-950">{value}</p>
      {subtitle && <p className="text-xs text-forest-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// Barangay-schedule status pill. Falls back to a neutral style for any
// status string that isn't one of the three known values.
const BADGE_STYLES = {
  Upcoming: "bg-cream-200 text-forest-800",
  Ongoing: "bg-clay-500 text-white",
  Completed: "bg-leaf-300 text-forest-900",
};

export function Badge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
        BADGE_STYLES[status] ?? "bg-cream-200 text-forest-700"
      }`}
    >
      {status}
    </span>
  );
}

export function EmptyState({ children }) {
  return <p className="text-sm text-forest-600 text-center py-8">{children}</p>;
}