// The fixed set of services the clinic offers. Kept in sync with
// frontend/src/lib/services.js — this is the source of truth the API
// validates "procedure" against so it can't drift from the dropdown.
export const SERVICES = [
  "Tooth Extraction",
  "Tooth Consultation",
  "E-Consultation",
  "Oral Screening",
  "Risk Assessment",
  "Oral Prophylaxis",
  "Fluoride Varnish Application",
  "Counseling",
];

// How many times a patient must have the SAME procedure logged before it's
// considered "Completed" instead of "Not Completed". Anything not listed
// here defaults to 1 visit. Keep in sync with
// frontend/src/lib/services.js (SERVICE_VISITS_REQUIRED).
export const SERVICE_VISITS_REQUIRED = {
  "Tooth Extraction": 1,
  "Tooth Consultation": 1,
  "E-Consultation": 1,
  "Oral Screening": 2,
  "Risk Assessment": 2,
  "Oral Prophylaxis": 2,
  "Fluoride Varnish Application": 2,
  "Counseling": 2,
};

export function visitsRequiredFor(procedure) {
  return SERVICE_VISITS_REQUIRED[procedure] || 1;
}