// The Individual Patient Treatment Record of ONE service record (visit): membership,
// medical history, hospitalization, diet and conforme. It is saved as JSON in
// dental_records.treatment_record, so every visit keeps its own copy and editing one
// visit never changes the others. Only the fields listed here are ever stored.

export const TREATMENT_BOOL_FIELDS = [
  "is_nhts_pr",
  "is_4ps",
  "is_indigenous_people",
  "has_hypertension_cva",
  "has_diabetes_mellitus",
  "has_blood_disorders",
  "has_cardio_heart_disease",
  "has_thyroid_disorders",
  "has_tattoo",
];

export const TREATMENT_TEXT_FIELDS = [
  "surname",
  "first_name",
  "middle_name",
  "birthdate",
  "sex",
  "gender",
  "gender_other",
  "place_of_birth",
  "cellphone_no",
  "occupation",
  "barangay",
  "address",
  "parent_guardian",
  "blood_pressure",
  "pulse_rate",
  "temperature",
  "philhealth_no",
  "sss_no",
  "gsis_no",
  "allergies",
  "hepatitis",
  "malignancy",
  "hosp_medical",
  "hosp_surgical",
  "hosp_blood_transfusion",
  "hosp_others",
  "diet_sugar_beverages",
  "diet_alcohol",
  "diet_tobacco",
  "diet_betel_nut",
  "conforme_name",
];

const on = (v) => v === true || v === 1 || v === "1" || v === "true";

// Cleans whatever the browser sent into the JSON text to store. null = nothing sent.
export function normalizeTreatmentRecord(input) {
  if (input === undefined || input === null) return null;
  let obj = input;
  if (typeof input === "string") {
    try {
      obj = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const f of TREATMENT_BOOL_FIELDS) out[f] = on(obj[f]);
  for (const f of TREATMENT_TEXT_FIELDS) out[f] = obj[f] == null ? "" : String(obj[f]).slice(0, 500);
  return JSON.stringify(out);
}