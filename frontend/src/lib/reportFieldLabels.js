// Human-readable labels for the e-FHSIS Monthly Report category fields
// (backend/routes/monthlyReports.js CATEGORY_FIELDS). Used on Patient
// Management to show which report bucket a service record was auto-counted
// under. Deliberately does not cover "orally_fit_*"/"dmft_*" — those are
// clinical-judgment categories on the paper form, not derivable from a
// patient's age/sex/pregnancy status, so records are never auto-counted
// into them (see backend/lib/reportSync.js).
export const REPORT_FIELD_LABELS = {
  infants_m: "Infants 0–11mos (M)",
  infants_f: "Infants 0–11mos (F)",
  children_1_4_m: "Children 1–4y (M)",
  children_1_4_f: "Children 1–4y (F)",
  children_5_9_m: "Children 5–9y (M)",
  children_5_9_f: "Children 5–9y (F)",
  adol_10_14_m: "Adolescents 10–14y (M)",
  adol_10_14_f: "Adolescents 10–14y (F)",
  adol_15_19_m: "Adolescents 15–19y (M)",
  adol_15_19_f: "Adolescents 15–19y (F)",
  adults_m: "Adults 20–59y (M)",
  adults_f: "Adults 20–59y (F)",
  senior_m: "Senior Citizens 60y+ (M)",
  senior_f: "Senior Citizens 60y+ (F)",
  pregnant_f: "Pregnant Women",
};
