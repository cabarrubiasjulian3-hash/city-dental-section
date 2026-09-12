import { IconPatient, IconDoctor } from "./icons";

// Pill-style Patient/Doctor switch shown at the top of the login and
// sign-up modals. Purely a UI selector — it doesn't call the API by
// itself, the parent form reads `value` to decide which fields/endpoint
// to use on submit.
export default function RoleToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <button
        type="button"
        onClick={() => onChange("patient")}
        className={`flex-1 flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
          value === "patient"
            ? "bg-forest-900 text-cream-50"
            : "bg-cream-200 text-forest-900 hover:bg-cream-300"
        }`}
      >
        <IconPatient className="w-[18px] h-[18px]" />
        Patient
      </button>
      <button
        type="button"
        onClick={() => onChange("doctor")}
        className={`flex-1 flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
          value === "doctor"
            ? "bg-forest-900 text-cream-50"
            : "bg-cream-200 text-forest-900 hover:bg-cream-300"
        }`}
      >
        <IconDoctor className="w-[18px] h-[18px]" />
        Doctor
      </button>
    </div>
  );
}