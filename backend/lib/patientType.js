// Patient Type = PWD / Senior Citizen / Pregnant. It is frozen on every
// service record (dental_records.patient_type) so Reports count the visit by
// what the patient was AT THAT VISIT, even if their flags change later.
// Stored as "none" or a CSV in this order: "PWD,Senior,Pregnant".

export function flagsFromSnapshot(snapshot) {
  if (typeof snapshot !== "string" || snapshot === "") return null; // unknown (old record)
  return {
    is_pwd: snapshot.includes("PWD"),
    is_senior_citizen: snapshot.includes("Senior"),
    is_pregnant: snapshot.includes("Pregnant"),
  };
}

export function snapshotFromFlags(flags) {
  const on = (v) => v === true || v === 1 || v === "1" || v === "true";
  const tags = [];
  if (on(flags?.is_pwd)) tags.push("PWD");
  if (on(flags?.is_senior_citizen)) tags.push("Senior");
  if (on(flags?.is_pregnant)) tags.push("Pregnant");
  return tags.length ? tags.join(",") : "none";
}

// Clean up a value sent by the frontend. Returns null when not provided.
// Same rules as the Patients page: Male can't be Pregnant; 60+ is always Senior.
export function normalizePatientType(value, patient, age) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const flags = flagsFromSnapshot(value);
  if (patient?.sex === "Male") flags.is_pregnant = false;
  if (age != null && age >= 60) flags.is_senior_citizen = true;
  return snapshotFromFlags(flags);
}

// Senior Citizen follows the age: 60+ always, under 60 never. Only when the age
// is unknown does the saved flag decide.
export function seniorFor(flag, age) {
  return age !== null && age !== undefined ? age >= 60 : Boolean(flag);
}