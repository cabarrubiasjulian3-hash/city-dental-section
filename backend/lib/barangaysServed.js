// "Barangays that can attend" for a schedule entry / weekly rotation. The API
// takes an array (or a comma-separated string) and stores one comma-separated
// text value, e.g. "Camaysa, Ibas, Dapdap". undefined = field not sent (keep
// what is stored); null = nothing listed (open to everyone).
export function normalizeServed(value) {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const unique = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
  return unique.length ? unique.join(", ") : null;
}