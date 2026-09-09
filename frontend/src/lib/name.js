// Builds the single "name" string the backend stores/matches on, out of
// separate Surname / First Name / Middle Name fields.
//
// This is used in TWO places that must never drift apart:
//   1. Admin's "New Patient Record" form (pages/admin/Patients.jsx)
//   2. The public patient Signup form (components/SignupModal.jsx)
//
// Registration matches a new signup to an existing clinic record with a
// plain string comparison on `name` (see backend/routes/auth.js's
// findByNameBarangay). If these two call sites ever compose the name
// differently, that match silently stops working — so both import this
// one function instead of each having their own copy.
//
// Middle name is optional — a single letter is treated as an initial.
export function composeFullName({ surname, first_name, middle_name }) {
  const sur = (surname || "").trim();
  const first = (first_name || "").trim();
  let middle = (middle_name || "").trim();
  if (middle.length === 1) middle = `${middle}.`;
  return [sur ? `${sur},` : "", first, middle].filter(Boolean).join(" ").trim();
}