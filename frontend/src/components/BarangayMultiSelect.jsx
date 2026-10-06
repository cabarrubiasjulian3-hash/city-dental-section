import { useMemo, useRef, useState } from "react";
import { X as XIcon } from "lucide-react";
import { TAYABAS_BARANGAYS } from "../lib/barangays";

// Pick several barangays: type a few letters, choose from the suggestions
// (click, or ↑ ↓ and Enter) and each pick becomes a removable chip.
//
//   <BarangayMultiSelect value={["Camaysa", "Ibas"]} onChange={(list) => ...} />
export default function BarangayMultiSelect({ value, onChange, placeholder = "Type a barangay…" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const suggestions = useMemo(() => {
    const q = query
      .toLowerCase()
      .replace(/\b(barangay|brgy\.?)\b/g, "")
      .trim();
    return TAYABAS_BARANGAYS.filter((name) => !value.includes(name) && (!q || name.toLowerCase().includes(q))).slice(0, 8);
  }, [query, value]);

  function add(name) {
    if (!name || value.includes(name)) return;
    onChange([...value, name]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(name) {
    onChange(value.filter((n) => n !== name));
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the surrounding form from this box.
      e.preventDefault();
      if (open && suggestions[active]) add(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-cream-200 bg-cream-100 px-2 py-1.5 focus-within:ring-2 focus-within:ring-forest-500"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 rounded-full bg-cream-200 pl-2.5 pr-1 py-0.5 text-xs text-forest-950">
            {name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(name);
              }}
              aria-label={`Remove ${name}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-forest-700 hover:bg-cream-300"
            >
              <XIcon size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? "Add another…" : placeholder}
          aria-label="Add a barangay"
          autoComplete="off"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-cream-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === active}
              // mouse-down (not click) so the input doesn't lose focus first
              onMouseDown={(e) => {
                e.preventDefault();
                add(name);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm text-forest-950 ${i === active ? "bg-cream-200" : ""}`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="mt-1 text-xs font-semibold text-forest-700 underline hover:text-forest-950">
          Clear all ({value.length})
        </button>
      )}
    </div>
  );
}