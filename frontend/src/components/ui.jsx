// Every card gets the same soft, medium "outer shadow" look (not a border)
// so cards read as gently raised, borderless panels — matches the
// reference dashboard design.
const CARD_SHADOW = "shadow-[0_2px_12px_rgba(37,53,34,0.10)]";

export function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <div className={`bg-cream-50 rounded-2xl overflow-hidden ${CARD_SHADOW} ${className}`}>
      {title && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base text-forest-950">{title}</h3>
            {subtitle && <p className="text-xs text-forest-600 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5 pt-2 flex-1">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, subtitle, icon }) {
  return (
    <div className={`bg-cream-50 rounded-2xl p-5 ${CARD_SHADOW}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-forest-700">{label}</p>
        {icon && (
          <span className="w-8 h-8 rounded-full bg-leaf-200 text-brand-800 flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
      </div>
      <p className="text-3xl font-display font-bold text-forest-950 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-forest-500 mt-1">{subtitle}</p>}
    </div>
  );
}

const statusColors = {
  Pending: "bg-amber-100 text-amber-800",
  Approved: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
  Completed: "bg-lime-100 text-brand-900",
  Cancelled: "bg-gray-200 text-gray-600",
  Unpaid: "bg-amber-100 text-amber-800",
  Paid: "bg-green-100 text-green-800",
  Waived: "bg-gray-200 text-gray-600",
  // Barangay Activity Schedule statuses
  Upcoming: "bg-brand-900 text-brand-50",
  Ongoing: "bg-lime-200 text-brand-900",
};

export function Badge({ status }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

export function EmptyState({ children }) {
  return <p className="text-sm text-forest-700 text-center py-10">{children}</p>;
}